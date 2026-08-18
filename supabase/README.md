# Configuración de Supabase para Moneva

1. Crea o vincula un proyecto y ejecuta `supabase db push`.
2. Activa Google en Authentication → Providers y configura el client ID/secret.
3. Agrega `http://localhost:3000/auth/callback` y la URL de producción a la lista de redirect URLs.
4. Copia la Project URL y la publishable key a `.env.local`.

Cada alta de Auth crea automáticamente el perfil, una cuenta de efectivo, las categorías iniciales y los cinco grupos presupuestarios. No existe una lista de correos ni un propietario global: cada fila pertenece al `auth.uid()` de la sesión.

La aplicación no usa la service-role key en el navegador. Las tablas públicas tienen RLS, políticas por propietario, claves foráneas compuestas que impiden referencias entre usuarios y grants mínimos explícitos. Las preferencias y los datos offline también se separan por usuario y se cifran localmente con AES-GCM.
