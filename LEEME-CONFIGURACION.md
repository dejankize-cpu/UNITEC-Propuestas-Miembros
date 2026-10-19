# Pasos únicos en Firebase / Cloudinary (sin esto el login no funciona)

1. **Authentication → Sign-in method**: activa **Correo electrónico/Contraseña**.
2. **Authentication → Settings → Authorized domains**: agrega tu dominio de GitHub Pages (`tuusuario.github.io`).
3. **Authentication → Users → Add user**: crea la cuenta del administrador (correo + contraseña) y copia su **UID**.
4. **Realtime Database → Datos**: crea el nodo `userRoles/<UID-del-admin>` con:
   `role: "admin"`, `roleKey: "admin"`, `active: true`, `email: "tu-correo"`.
5. **Realtime Database → Reglas**: pega el contenido de `firebase-database.rules.json` y publica.
6. **Cloudinary → Settings → Upload → Upload presets**: `DataBaseImgProgetUNITEC` debe estar en modo **Unsigned**.

Después: entra como administrador → registra miembros → "Asignar presidente o vicepresidente"
(se crea su cuenta con la contraseña inicial que pongas, mínimo 6 caracteres).
