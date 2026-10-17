# MongoDB replica set de un nodo en Pterodactyl

Esta guia se aplica al servidor MongoDB, no al contenedor del backend. Conserva el egg, imagen, directorio de datos, puerto interno y autenticacion actuales. La asignacion publica puede tener un puerto distinto al que escucha mongod dentro del contenedor.

## 1. Preparacion

Desde el panel registra el comando Startup actual y el archivo de configuracion que utiliza. Haz un backup con el servicio detenido o una copia consistente con las herramientas de MongoDB. No borres ni cambies `dbPath`. Comprueba que tienes un usuario administrador con permisos para iniciar la replicacion; el usuario de la aplicacion no necesariamente los tiene.

Si ya usas autenticacion, un replica set necesita tambien una clave interna (keyfile). Dentro del servidor, crea una sola vez un archivo persistente, propiedad del usuario que ejecuta mongod:

```sh
umask 077
openssl rand -base64 756 > /home/container/mongodb-keyfile
chmod 400 /home/container/mongodb-keyfile
```

No vuelvas a generar ni sobrescribas una clave existente. Si la imagen no tiene openssl, genera el archivo en una maquina de administracion y subelo por SFTP con esos permisos. No uses la contrasena del usuario como keyfile.

## 2. Configuracion y reinicio

Agrega al mongod.conf que YA utiliza tu egg (sin sustituir sus demas opciones):

```yaml
replication:
  replSetName: rs0
security:
  authorization: enabled
  keyFile: /home/container/mongodb-keyfile
```

Si `security` ya existe, agrega `keyFile` dentro de ese bloque, sin duplicarlo. Si el egg usa argumentos en Startup en lugar de un archivo, conserva todos los actuales y agrega `--replSet rs0 --keyFile /home/container/mongodb-keyfile`. Conserva el modo de autenticacion actual. El panel puede exigir editar la variable de argumentos o el egg desde administracion para que el cambio sea persistente.

Reinicia ese servidor desde el panel. Confirma que mongod inicio sin errores de permisos del keyfile ni del directorio de datos.

## 3. Iniciar el replica set una vez

Conecta mongosh dentro del contenedor, con un usuario administrador. Reemplaza PUERTO_INTERNO por el puerto real del proceso mongod; no supongas que coincide con la asignacion publica:

```sh
mongosh --host 127.0.0.1 --port PUERTO_INTERNO --username ADMIN --authenticationDatabase admin --password
```

La clave se solicita de forma interactiva. En mongosh:

```javascript
rs.initiate({
  _id: "rs0",
  members: [{ _id: 0, host: "localhost:PUERTO_INTERNO" }]
})
db.hello()
rs.status()
```

Reemplaza tambien PUERTO_INTERNO en `host` antes de ejecutar. Espera hasta ver `setName: "rs0"` e `isWritablePrimary: true`. Si el conjunto ya estaba iniciado, revisa `rs.conf()` en lugar de repetir la inicializacion o forzar una reconfiguracion.

## 4. Conexion del backend

Para este unico nodo detras del puerto publicado de Pterodactyl, usa una conexion directa y escribe la URI solamente en el archivo `.env` privado del backend:

```text
DATABASE_URL=mongodb://USER:PASSWORD@HOST:PUERTO_PUBLICO/synapse?authSource=admin&replicaSet=rs0&directConnection=true
```

`authSource` es la base donde se creo el usuario, que puede ser distinta de `admin`. Codifica caracteres especiales del usuario y clave con percent-encoding. El nombre `synapse` identifica la base nueva de la aplicacion. El host `localhost` anunciado por el miembro es interno al contenedor: `directConnection=true` evita que el backend intente descubrirlo a traves de la red publica. Si agregas mas nodos, configura nombres y puertos accesibles por todos y elimina esta topologia de conexion directa.

Inicia la rama nueva del backend y verifica `/api/health/ready`. Despues registra un usuario, guarda una generacion y recuperala. Esta guia prepara los pasos; no modifica automaticamente el servidor remoto.

## Referencias

- https://www.mongodb.com/docs/manual/tutorial/convert-standalone-to-replica-set/
- https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set-with-keyfile-access-control/
- https://www.prisma.io/docs/orm/v6/overview/databases/mongodb
- https://docs.pterodactyl.io/v1/guides/egg-creation/egg-variables
