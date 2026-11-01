from django.db import migrations


IMAGES = (
    ('https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&q=80&w=400', '/assets/images/programs/dental-tech.webp'),
    ('https://images.unsplash.com/photo-1551076805-e1869033e561?auto=format&fit=crop&q=80&w=400', '/assets/images/programs/operations.webp'),
    ('https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&q=80&w=400', '/assets/images/programs/physician-assistant.webp'),
    ('https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&q=80&w=400', '/assets/images/programs/laboratories.webp'),
    ('https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=400', '/assets/images/programs/business.webp'),
    ('https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=400', '/assets/images/programs/accounting.webp'),
    ('https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&q=80&w=400', '/assets/images/programs/it.webp'),
    ('https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&q=80&w=400', '/assets/images/programs/decor.webp'),
)


def localize_default_images(apps, schema_editor):
    for name in ('Department', 'Lab'):
        model = apps.get_model('core', name)
        for old_url, new_url in IMAGES:
            model.objects.using(schema_editor.connection.alias).filter(image_url=old_url).update(image_url=new_url)


class Migration(migrations.Migration):
    dependencies = [('core', '0006_generated_images')]
    operations = [migrations.RunPython(localize_default_images, migrations.RunPython.noop)]
