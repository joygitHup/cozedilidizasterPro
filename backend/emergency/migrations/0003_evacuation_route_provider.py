from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('emergency', '0002_add_shelter_coords'),
    ]

    operations = [
        migrations.AddField(
            model_name='evacuationtask',
            name='route_provider',
            field=models.CharField(
                blank=True,
                default='',
                help_text='mapbox | osrm | interpolate',
                max_length=20,
                verbose_name='路网来源',
            ),
        ),
    ]
