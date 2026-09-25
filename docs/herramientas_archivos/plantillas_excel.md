# Servicio nuevo "Plantillas Excel"

Estado: plantilla 1 hecha y probada en la app con el original real (2026-09-25),
rama `plantillas-excel`. Próximo: orquestador con detección automática (§2, §4).

## 1. Contexto

Los clientes mandan sus Excel en formatos distintos: cambian los nombres de las
columnas, su posición, o directamente qué trae cada archivo. Hoy eso se arregla
a mano cada vez.

Idea: un servicio donde cada caso concreto es una **plantilla** con su propio
botón. El usuario elige la plantilla, elige el Excel original de su cliente y
el programa genera el archivo que hace falta.

## 2. Flujo en el frontend

Entrada única con detección automática (como el servicio de tablas PDF), más la
lista de plantillas como camino manual. Decidido el 2026-09-25.

1. Servicio "Plantillas Excel" en el navbar.
2. Botón principal **"Procesar Excel"**: abre el administrador de archivos para
   elegir el Excel original del cliente.
3. El **orquestador** le pasa el archivo a TODAS las plantillas del registro; cada
   una devuelve un puntaje de parecido (ver §4). Según el resultado:
   - **Coincide una sola** → se ejecuta directo.
   - **Coinciden varias** → se muestran SOLO esas como botones y el usuario elige.
     Pasa cuando el mismo formato de archivo sirve para salidas distintas (ej. otro
     cliente manda la misma grilla pero quiere el resumen por razón social).
   - **No coincide ninguna** → se muestra la plantilla más parecida y qué cabeceras
     le faltan (el mensaje que ya existe hoy).
4. Debajo, la **lista de plantillas** (un botón por plantilla, con su color): el
   camino manual para forzar una plantilla. Mismo flujo: elegir archivo → procesar.
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

En el resultado esperado, al final de Datos hay tres columnas con fórmulas que el
original NO trae (las agrega la plantilla): `Tipo (FC/NC)` = `LEFT(D, ...)`,
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

Tres momentos:

0. **Detección (orquestador).** Cada plantilla, en su `reconocer`, devuelve un
   **puntaje** = cabeceras obligatorias encontradas / total de obligatorias
   (0 a 1), buscadas por nombre normalizado. **Coincide** = puntaje 1 (están
   todas): es lo mínimo para poder transformar, así que el umbral no puede ser
   menor. El puntaje menor a 1 sirve para ordenar y mostrar "la más parecida".
   Diferencia con el PDF: allá se suman `palabrasClave` contra un `umbral` y gana
   el que lo supera; acá no se elige "la que más suma" entre varias en 1, se le
   pregunta al usuario, porque la plantilla se define por la SALIDA que quiere.
1. **Antes de transformar:** buscar por NOMBRE las cabeceras obligatorias
   (Año - mes, Comprobante, Conc./Art., Descripción, Neto Ítem, IVA Insc. Ítem).
   Si falta alguna, frenar y decir cuál. Nunca buscar por posición de columna
   (lección de la DDJJ: las columnas se mueven). Normalizar la cabecera antes de
   comparar: minúsculas, sin tildes, sin espacios de más (ojo: `Tasa IVA ` viene
   con un espacio al final).
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
- **Las columnas Tipo (FC/NC), Letra y Tipo comprobante NO vienen en el original**
  (corregido 2026-09-25 al probar con el original real: la hoja viene como "Sheet1"
  y sin esas columnas). Si faltan, la plantilla las agrega al final con las fórmulas
  del contador (`LEFT`/`MID`/concatenación) + resultado calculado; si vienen, las usa.
  Si la hoja tiene nombre genérico ("Sheet1", "Hoja1") se renombra a "Datos".
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
- **Orquestador híbrido** (§2): detección automática + lista manual. El orquestador
  vive en el manager (`plantillasExcelManager.js`), recorre `registroPlantillas.js`
  y no sabe nada de cada plantilla más allá de `reconocer`/`transformar`. Sumar una
  plantilla sigue siendo: escribir el módulo y registrarlo.
- **Color e ícono por plantilla, definidos en su módulo** (junto a `nombre` y
  `descripcion`). El usuario NO los edita por ahora: con la detección automática
  casi no va a buscar botones, y hacerlo editable implica guardar preferencias,
  una pantalla para editarlas y resolver nombres repetidos. Se revisa si, con
  muchas plantillas, los usuarios lo piden.

## 6. Preguntas abiertas

Ninguna.

## 7. Pasos en orden

Hecho (2026-09-25): archivo original real conseguido; backend (dominio, registro,
plantilla 1); tests contra el ejemplo y contra el original real; frontend con la
lista de plantillas; probado en la app en Linux.

Pendiente:
1. `reconocer` devuelve `puntaje` (0 a 1) además de `ok`/`faltantes`.
2. Manager: `detectarPlantilla(ruta)` → lista ordenada `{ id, nombre, puntaje,
   faltantes }`; IPC nuevo `plantillasExcel:detectar` + preload.
3. Metadatos `color` e `icono` en cada plantilla, expuestos en `listar`.
4. Frontend: botón "Procesar Excel" con los 3 casos de §2.3 + lista manual debajo
   con los colores.
5. Tests: una coincide / varias coinciden (plantilla falsa de prueba) / ninguna.
6. Probar en el portable de Windows (rutas con espacios y paréntesis, como el
   nombre del ejemplo).
