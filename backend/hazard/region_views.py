"""行政区划：市→区→（县可选）→村；区下可直接挂村"""
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Region

LEVEL_LABEL = dict(Region.Level.choices)
ALLOWED_CHILDREN = Region.LEVEL_CHILDREN


def _child_options(level: str):
    return [
        {'level': lv, 'level_display': LEVEL_LABEL.get(lv, lv)}
        for lv in ALLOWED_CHILDREN.get(level, [])
    ]


def serialize_node(node: Region, children_map: dict) -> dict:
    kids = children_map.get(node.id, [])
    # 县在前、村在后，便于无县地区直接看村
    kids = sorted(
        kids,
        key=lambda x: (0 if x.level == Region.Level.COUNTY else 1 if x.level == Region.Level.VILLAGE else 2, x.sort_order, x.id),
    )
    options = _child_options(node.level)
    default_child = options[0]['level'] if options else None
    return {
        'id': node.id,
        'name': node.name,
        'level': node.level,
        'level_display': LEVEL_LABEL.get(node.level, node.level),
        'parent_id': node.parent_id,
        'child_level': default_child,
        'child_level_display': LEVEL_LABEL.get(default_child or '', ''),
        'child_levels': [o['level'] for o in options],
        'child_level_options': options,
        'children': [serialize_node(c, children_map) for c in kids],
    }


def build_tree():
    nodes = list(Region.objects.all().order_by('sort_order', 'id'))
    children_map = {}
    for n in nodes:
        children_map.setdefault(n.parent_id, []).append(n)
    roots = children_map.get(None, [])
    return [serialize_node(r, children_map) for r in roots]


def _node_payload(node: Region):
    options = _child_options(node.level)
    default_child = options[0]['level'] if options else None
    return {
        'id': node.id,
        'name': node.name,
        'level': node.level,
        'level_display': node.get_level_display(),
        'parent_id': node.parent_id,
        'child_level': default_child,
        'child_level_display': LEVEL_LABEL.get(default_child or '', ''),
        'child_levels': [o['level'] for o in options],
        'child_level_options': options,
        'children': [],
    }


class RegionViewSet(viewsets.ViewSet):
    """GET tree / POST create child / DELETE"""

    def list(self, request):
        return Response({'results': build_tree()})

    @action(detail=False, methods=['get'])
    def tree(self, request):
        return Response({'results': build_tree()})

    def create(self, request):
        """
        新增区域节点
        body: { name, parent_id?, level? }
        - 无 parent：创建市
        - 有 parent：level 须为该上级允许的下级；
          区下可建「县」或「村」（无县级单位时可直接挂村）
        """
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'detail': '请填写区域名称'}, status=status.HTTP_400_BAD_REQUEST)
        if len(name) > 50:
            return Response({'detail': '名称过长'}, status=status.HTTP_400_BAD_REQUEST)

        parent_id = request.data.get('parent_id')
        parent = None
        if parent_id not in (None, '', 0, '0'):
            try:
                parent = Region.objects.get(pk=int(parent_id))
            except (Region.DoesNotExist, TypeError, ValueError):
                return Response({'detail': '上级区域不存在'}, status=status.HTTP_400_BAD_REQUEST)

            allowed = ALLOWED_CHILDREN.get(parent.level, [])
            if not allowed:
                return Response(
                    {'detail': '该级区域下不能再新增'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            raw_level = (request.data.get('level') or '').strip()
            if raw_level:
                if raw_level not in allowed:
                    labels = '、'.join(LEVEL_LABEL.get(x, x) for x in allowed)
                    return Response(
                        {'detail': f'「{parent.name}」下仅可新增：{labels}'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                level = raw_level
            else:
                level = allowed[0]
        else:
            level = (request.data.get('level') or Region.Level.CITY).strip()
            if level != Region.Level.CITY:
                return Response(
                    {'detail': '顶级区域只能创建市'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if Region.objects.filter(parent=parent, name=name, level=level).exists():
            return Response(
                {'detail': f'同级已存在「{name}」'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        siblings = Region.objects.filter(parent=parent).count()
        node = Region.objects.create(
            name=name,
            level=level,
            parent=parent,
            sort_order=siblings,
        )
        return Response(_node_payload(node), status=status.HTTP_201_CREATED)

    def destroy(self, request, pk=None):
        try:
            node = Region.objects.get(pk=pk)
        except Region.DoesNotExist:
            return Response({'detail': '区域不存在'}, status=status.HTTP_404_NOT_FOUND)
        if node.children.exists():
            return Response(
                {'detail': '请先删除下级区域'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        node.delete()
        return Response({'detail': '已删除'})
