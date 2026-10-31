from django.db import migrations


IMAGES = (
    ('https://images.unsplash.com/photo-1577158200653-64da653062d3?auto=format&fit=crop&q=80&w=400', '/assets/images/generated/pharmacy.webp'),
    ('https://images.unsplash.com/photo-1584515901387-a7a1a7f35360?auto=format&fit=crop&q=80&w=400', '/assets/images/generated/nursing.webp'),
    ('https://images.unsplash.com/photo-1505151828120-04874d82b6b0?auto=format&fit=crop&q=80&w=400', '/assets/images/generated/midwifery.webp'),
    ('https://images.unsplash.com/photo-1579684389782-64d84b5e905d?auto=format&fit=crop&q=80&w=400', '/assets/images/generated/dental-lab.webp'),
)


def replace_broken_defaults(apps, schema_editor):
    for name in ('Department', 'Lab'):
        model = apps.get_model('core', name)
        for old_url, new_url in IMAGES:
            model.objects.using(schema_editor.connection.alias).filter(image_url=old_url).update(image_url=new_url)


class Migration(migrations.Migration):
    dependencies = [('core', '0005_contactmessage')]
    operations = [migrations.RunPython(replace_broken_defaults, migrations.RunPython.noop)]
