# Configuración de Supabase para Moneva

1. Crea o vincula un proyecto y ejecuta `supabase db push`.
2. Activa Google en Authentication → Providers, configura el client ID/secret y desactiva Email para que Google sea el único proveedor.
3. Agrega `http://localhost:3000/auth/callback` y la URL de producción a la lista de redirect URLs.
4. Copia la Project URL y la publishable key a `.env.local`.

La aplicación es privada. La migración `private_access_and_scalable_reports` conserva como administrador inicial a la cuenta Google que ya existía y, desde `/ajustes/acceso`, ese administrador autoriza o revoca los demás correos y roles. Una cuenta no autorizada puede completar OAuth, pero no recibe filas de aplicación y las políticas restrictivas bloquean toda lectura o escritura. La revocación se aplica a sesiones ya abiertas en la siguiente consulta.

Cuando una cuenta Google autorizada entra por primera vez se crea automáticamente su perfil, una cuenta de efectivo, las categorías iniciales y cinco grupos presupuestarios. Luego cada persona puede crear, renombrar, ordenar, unir o archivar grupos y subcategorías. Los grupos incluidos en el plan deben sumar exactamente 100%; el RPC y un trigger diferido vuelven imposible guardar una distribución inválida, aunque se omita el frontend.

La aplicación no usa la service-role key en el navegador. Las siete tablas públicas tienen RLS, una política permisiva por propietario y otra restrictiva que exige pertenecer a la lista privada. Las claves foráneas compuestas impiden referencias cruzadas entre usuarios y los grants son mínimos y explícitos. Las preferencias se guardan en el perfil del usuario; la caché offline y la cola se separan por `userId` y se cifran localmente con AES-GCM.

Los balances, resúmenes mensuales y reportes se agregan dentro de PostgreSQL. El historial usa paginación por cursor con índices por usuario/fecha, por lo que el cliente no necesita descargar todos los movimientos para seguir calculando cifras exactas.
