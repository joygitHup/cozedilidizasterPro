from django.db import migrations, models
import django.db.models.deletion


def seed_regions(apps, schema_editor):
    Region = apps.get_model('hazard', 'Region')
    HazardPoint = apps.get_model('hazard', 'HazardPoint')

    if not Region.objects.exists():
        city = Region.objects.create(name='示例市', level='city', sort_order=0)
        district = Region.objects.create(
            name='示例区', level='district', parent=city, sort_order=0
        )
        county = Region.objects.create(
            name='XX县', level='county', parent=district, sort_order=0
        )
        for i, vname in enumerate(['竹园村', '石桥村', '李家村']):
            Region.objects.create(
                name=vname, level='village', parent=county, sort_order=i
            )

    # 回填隐患点市区字段
    for p in HazardPoint.objects.all():
        dirty = False
        if not getattr(p, 'city', None):
            p.city = '示例市'
            dirty = True
        if not getattr(p, 'district', None):
            p.district = p.town or '示例区'
            dirty = True
        if dirty:
            p.save()


def unseed(apps, schema_editor):
    Region = apps.get_model('hazard', 'Region')
    Region.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('hazard', '0002_enhance_inspection_task'),
    ]

    operations = [
        migrations.CreateModel(
            name='Region',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=50, verbose_name='名称')),
                ('level', models.CharField(choices=[('city', '市'), ('district', '区'), ('county', '县'), ('village', '村')], max_length=20, verbose_name='层级')),
                ('sort_order', models.IntegerField(default=0, verbose_name='排序')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('parent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='children', to='hazard.region', verbose_name='上级区域')),
            ],
            options={
                'verbose_name': '行政区划',
                'verbose_name_plural': '行政区划',
                'db_table': 'hazard_region',
                'ordering': ['sort_order', 'id'],
            },
        ),
        migrations.AddField(
            model_name='hazardpoint',
            name='city',
            field=models.CharField(blank=True, default='', max_length=50, verbose_name='市'),
        ),
        migrations.AddField(
            model_name='hazardpoint',
            name='district',
            field=models.CharField(blank=True, default='', max_length=50, verbose_name='区'),
        ),
        migrations.AlterField(
            model_name='hazardpoint',
            name='town',
            field=models.CharField(blank=True, max_length=50, verbose_name='镇(兼容)'),
        ),
        migrations.AddIndex(
            model_name='region',
            index=models.Index(fields=['level'], name='hazard_regi_level_6c4d0e_idx'),
        ),
        migrations.AddIndex(
            model_name='region',
            index=models.Index(fields=['parent', 'level'], name='hazard_regi_parent__b2c1a4_idx'),
        ),
        migrations.AddConstraint(
            model_name='region',
            constraint=models.UniqueConstraint(fields=('parent', 'name', 'level'), name='uniq_region_parent_name_level'),
        ),
        migrations.RunPython(seed_regions, unseed),
    ]
