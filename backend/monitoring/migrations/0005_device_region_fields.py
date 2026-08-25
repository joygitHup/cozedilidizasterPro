from django.db import migrations, models


def backfill_device_regions(apps, schema_editor):
    MonitoringDevice = apps.get_model('monitoring', 'MonitoringDevice')
    for d in MonitoringDevice.objects.select_related('hazard_point').all():
        hp = d.hazard_point
        dirty = False
        if hp:
            if not (d.city or '').strip() and (hp.city or '').strip():
                d.city = hp.city
                dirty = True
            district = (hp.district or hp.town or '').strip()
            if not (d.district or '').strip() and district:
                d.district = district
                dirty = True
            if not (d.county or '').strip() and (hp.county or '').strip():
                d.county = hp.county
                dirty = True
            if not (d.village or '').strip() and (hp.village or '').strip():
                d.village = hp.village
                dirty = True
            if not (d.town or '').strip():
                d.town = (hp.town or hp.district or '').strip()
                if d.town:
                    dirty = True
            if not (d.address or '').strip() and (hp.address or hp.name):
                d.address = hp.address or hp.name
                dirty = True
        # 兼容：旧数据只有 address，尽量把 town 同步到 district
        if not (d.district or '').strip() and (d.town or '').strip():
            d.district = d.town
            dirty = True
        if dirty:
            d.save()


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('monitoring', '0004_ingest_log_trace_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='monitoringdevice',
            name='city',
            field=models.CharField(blank=True, default='', max_length=50, verbose_name='市'),
        ),
        migrations.AddField(
            model_name='monitoringdevice',
            name='district',
            field=models.CharField(blank=True, default='', max_length=50, verbose_name='区'),
        ),
        migrations.AddField(
            model_name='monitoringdevice',
            name='county',
            field=models.CharField(blank=True, default='', max_length=50, verbose_name='县'),
        ),
        migrations.AddField(
            model_name='monitoringdevice',
            name='village',
            field=models.CharField(blank=True, default='', max_length=50, verbose_name='村'),
        ),
        migrations.AddField(
            model_name='monitoringdevice',
            name='town',
            field=models.CharField(blank=True, default='', max_length=50, verbose_name='镇(兼容)'),
        ),
        migrations.AlterField(
            model_name='monitoringdevice',
            name='address',
            field=models.CharField(blank=True, max_length=200, verbose_name='详细地址'),
        ),
        migrations.RunPython(backfill_device_regions, noop_reverse),
    ]
