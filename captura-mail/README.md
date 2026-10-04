# captura-mail

Servicio que recibe los paquetes de la página de captura de señas (`/?captura`) y los envía por correo, con el archivo adjunto, a `afgarciaos@gmail.com`. Es un Cloudflare Worker que usa Email Routing.

- **Costo:** gratis. Los envíos a direcciones verificadas de la cuenta no tienen costo ni cuentan para las cuotas, y el plan gratis de Workers permite 100 000 solicitudes al día.
- **Límites:** 20 MB por paquete (el correo admite 25 MiB) y 5 envíos por minuto por IP.
- **Restricción:** solo puede escribir a la dirección de `allowed_destination_addresses` (en `wrangler.jsonc`).
- **Privacidad:** no guarda nada; el archivo pasa directo al correo. No abre el paquete: revisa el origen, el nombre, el tamaño y la cabecera gzip. La validación completa la hace `npm run dataset`.
- **Dirección:** `https://captura.inlscasiste.store/captura`. La app la usa mediante `VITE_CAPTURE_URL`, que está fijada en `.github/workflows/deploy.yml`.

## Desplegar (una vez)

Requisitos en el panel de Cloudflare:
- `inlscasiste.store` → **Email** → **Email Routing** activo (ya lo está: los registros MX y SPF de Cloudflare están publicados);
- `afgarciaos@gmail.com` como **destino verificado**.

```bash
cd captura-mail
npm install
npx wrangler login    # abre el navegador para autorizar su cuenta de Cloudflare
npm test              # pruebas con un envío falso
npm run deploy
```

Al desplegar, Cloudflare crea `captura.inlscasiste.store`. Para comprobarlo, abra https://inlscasiste.store/?captura, grabe una toma y pulse **Enviar**: debe llegar un correo con asunto `InLSC captura de señas · S-XXXX`.

## Probar en local

```bash
npm run dev           # http://localhost:8787 (el correo se simula: no se envía nada)
```

En otra terminal:

```bash
cd ../app && VITE_CAPTURE_URL=http://localhost:8787/captura INLSC_HTTP=1 PORT=5177 npm run dev
```

Abra http://localhost:5177/?captura. Los correos simulados quedan en `.wrangler/tmp/email/`, carpeta ignorada por git porque contiene datos de captura.

## Si algo falla

| Error en la página | Causa |
|---|---|
| "no se pudo enviar el correo" | El destino no está verificado en Email Routing, o el remitente (`SENDER`) no es del dominio |
| "origen no permitido" | La página no está en `ALLOWED_ORIGINS`, ni es localhost ni una IP de red local con https |
| "demasiados envíos" | Más de 5 en un minuto desde la misma red |
| "No hay conexión con el servicio de envío" | Sin internet, o el Worker no está desplegado |

En cualquiera de estos casos la página ofrece el envío manual (menú Compartir, o descarga + correo).
