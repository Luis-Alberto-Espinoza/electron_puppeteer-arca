# Servicio nuevo "Plantillas Excel"

Estado: idea, sin código. Charlado el 2026-09-24.

## 1. Contexto

Los clientes mandan sus Excel en formatos distintos: cambian los nombres de las
columnas, su posición, o directamente qué trae cada archivo. Hoy eso se arregla
a mano cada vez.

Idea: un servicio donde cada caso concreto es una **plantilla** con su propio
botón. El usuario elige la plantilla, elige el Excel original de su cliente y
el programa genera el archivo que hace falta.

## 2. Flujo en el frontend

1. Servicio nuevo "Plantillas Excel" en el menú.
2. Un submenú con un botón por plantilla (el nombre del botón dice qué resuelve).
   Ahí se irán sumando las plantillas futuras.
3. Al tocar una plantilla se abre el administrador de archivos para elegir el
   Excel original.
4. El programa verifica que el archivo sea el esperado (umbral, ver §4) y lo
   transforma según la plantilla.
5. Si todo da bien, deja un archivo **nuevo** al lado del original, con nombre
   descriptivo. El original no se toca.
6. Si algo falla, un mensaje claro que diga qué falta o qué no cierra.

## 3. Primera plantilla: Resumen de conceptos facturados (Vinos)

Ejemplo: `~/Descargas/Grilla_Conceptos_Facturados_Resumen_Vinos_corregido (2).xlsx`.
La hoja **Resumen** NO viene en el original: es lo que tenemos que generar.

**Hoja Datos (entrada), un renglón por ítem facturado.** Columnas que importan:

| Col | Cabecera | Uso |
|---|---|---|
| A | Año - mes | Período (para el nombre del archivo) |
| D | Comprobante | Ej. `FC B 0015 - 00009032`; de acá sale el tipo (`FC B`) |
| G | Conc./Art. | Código de actividad (ej. 4110101) |
| H | Descripción | Actividad (ej. VENTA DE VINOS) |
| I | Neto Ítem | Se suma en el resumen de neto |
| K | IVA Insc. Ítem | Se suma en el resumen de IVA |

Al final hay tres columnas con fórmulas: `Tipo (FC/NC)` = `LEFT(D, ...)`,
`Letra` = `MID(D, ...)`, `Tipo comprobante` = `Z & " " & AA`. El resumen agrupa
por esta última.

**Hoja Resumen (salida):**
- Bloque 1, neto: filas = actividades (Cód. + Actividad), columnas = tipos de
  comprobante (en el ejemplo FC A, FC B, NCR B) + Total. Celdas con `SUMIFS`
  sobre Datos. Fila Total y fila "Cant. de ítems" (`COUNTIFS`).
- Control de neto: total de la columna I en Datos, total del resumen y
  Diferencia (`ROUND(... , 2)`), que tiene que dar 0.
- Bloque 2, IVA: igual que el 1 pero sumando la columna K.
- Control de IVA: igual que el control de neto.
- Notas.

**Datos del ejemplo:** 83 ítems, 2 actividades, 3 tipos de comprobante. Las
notas de crédito (NCR) **ya vienen con signo negativo** en el original y se
suman tal cual, sin invertir.

## 4. El umbral (cuándo se da por bueno)

Dos momentos:

1. **Antes de transformar:** buscar por NOMBRE las cabeceras necesarias
   (Comprobante, Conc./Art., Descripción, Neto Ítem, IVA Insc. Ítem). Si falta
   alguna, frenar y decir cuál. Nunca buscar por posición de columna (lección
   de la DDJJ: las columnas se mueven). Normalizar la cabecera antes de comparar:
   minúsculas, sin tildes, sin espacios de más (ojo: `Tasa IVA ` viene con un
   espacio al final).
2. **Después de transformar:** los bloques de control. Si la diferencia de neto
   o de IVA no da 0, el archivo no se da por bueno.

## 5. Decisiones tomadas

- **Cada plantilla es un módulo en código**, no configuración, porque cada caso
  tiene su lógica. Cada módulo tiene dos partes: `reconocer(libro)` (¿es mi
  archivo? ¿qué falta?) y `transformar(libro)`. Es el mismo patrón que los
  "especialistas" de bancos del servicio de tablas PDF: conviene que se parezcan.
- **El original nunca se modifica.** Se escribe un archivo nuevo al lado.
- **Actividades y tipos de comprobante salen de los datos**, no quedan fijos:
  el mes que viene puede aparecer una actividad o un tipo nuevo.
- **Las columnas Tipo (FC/NC), Letra y Tipo comprobante vienen en el original.**
  No las generamos; son cabeceras obligatorias más para el `reconocer`.
- **El archivo nuevo = copia del original (hoja Datos intacta) + hoja Resumen.**
  Las fórmulas del Resumen leen de Datos, por eso tienen que viajar juntas.
- **El Resumen lleva fórmulas vivas** (`SUMIFS`, `COUNTIFS`, `ROUND`), igual que
  el ejemplo, y en cada celda se guarda también el resultado ya calculado, para
  que se vea el número en visores que no recalculan (vista previa de Windows,
  celular).
- **Formato visual copiado del ejemplo** (negritas, separador de miles, anchos).
- **Un solo archivo, una hoja Resumen por mes.** Si el original trae varios
  Año-mes, cada mes tiene su hoja (`Resumen 2026-08`, `Resumen 2026-09`...) dentro
  del mismo archivo. Las fórmulas suman un tercer criterio: la columna Año-mes.
  Con un solo mes, la hoja se llama simplemente `Resumen`.
- **Nombre del archivo:** con un mes, `<nombre original> - Resumen 2026-08.xlsx`;
  con varios, el rango del primero al último:
  `<nombre original> - Resumen 2026-08 a 2026-10.xlsx`. Si ya existe, se agrega
  un número; nunca se pisa.
- **NC y NCR mezclados no es un caso a cubrir**: lo del ejemplo fue un error de
  carga.
- **Solo `.xlsx`.** Si llega un `.xls` viejo, mensaje claro pidiendo guardarlo
  como `.xlsx` (exceljs no abre `.xls`).
- **Si un control no da 0, no se genera el archivo** y se muestra la diferencia.

## 6. Preguntas abiertas

Ninguna.

## 7. Pasos en orden

1. Conseguir un archivo ORIGINAL sin tocar (no el corregido) para probar.
2. Backend: dominio nuevo con su `handlers.js` (elegir archivo, procesar), un
   registro de plantillas y la primera plantilla con `reconocer`/`transformar`.
3. Test con el archivo de ejemplo: el Resumen generado tiene que dar los mismos
   totales que el corregido y diferencias en 0.
4. Frontend: vista con el submenú de plantillas, usando el sistema de diseño
   (`tokens.css`, `base.css`, clases `.ui-`).
5. Probar en el portable de Windows (rutas con espacios y paréntesis, como el
   nombre del ejemplo).
