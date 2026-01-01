# 📦 Componentes Reutilizables - Utils

Esta carpeta contiene componentes reutilizables que se pueden usar en cualquier parte de la aplicación.

---

## 🎯 Modal de Confirmación

### 📁 Archivos:
- `confirmModal.js` - Lógica del componente
- `confirmModal.css` - Estilos del modal

### ✅ Ya está configurado:
El modal se inicializa automáticamente al cargar la página desde `index.html`.

### 🚀 Cómo usar:

#### Uso básico:
```javascript
const confirmed = await showConfirmModal({
    message: '¿Estás seguro de realizar esta acción?'
});

if (confirmed) {
    // Usuario confirmó
    console.log('Usuario confirmó');
} else {
    // Usuario canceló
    console.log('Usuario canceló');
}
```

#### Uso completo (personalizado):
```javascript
const confirmed = await showConfirmModal({
    title: 'Eliminar Usuario',               // Título del modal
    message: '¿Deseas eliminar a Juan Pérez?',  // Mensaje
    icon: '🗑️',                              // Emoji/icono
    confirmText: 'Sí, eliminar',             // Texto botón confirmar
    cancelText: 'No, cancelar',              // Texto botón cancelar
    confirmBtnClass: 'danger'                // 'danger', 'success', o vacío
});
```

### 🎨 Estilos de botones:

| Clase | Color | Uso |
|---|---|---|
| `'danger'` | 🔴 Rojo | Acciones destructivas (eliminar, cancelar) |
| `'success'` | 🟢 Verde | Acciones positivas (guardar, confirmar) |
| _(vacío)_ | 🟡 Amarillo | Advertencias generales |

### 📝 Ejemplos:

#### Eliminar con botón rojo:
```javascript
await showConfirmModal({
    title: 'Eliminar Cliente',
    message: '¿Estás seguro de eliminar al cliente seleccionado?',
    icon: '🗑️',
    confirmText: 'Sí, eliminar',
    confirmBtnClass: 'danger'
});
```

#### Guardar con botón verde:
```javascript
await showConfirmModal({
    title: 'Guardar Cambios',
    message: '¿Deseas guardar los cambios realizados?',
    icon: '💾',
    confirmText: 'Guardar',
    confirmBtnClass: 'success'
});
```

#### Advertencia con botón amarillo:
```javascript
await showConfirmModal({
    message: 'Se perderán los cambios no guardados. ¿Continuar?',
    icon: '⚠️'
});
```

### 🔧 Callbacks opcionales:
```javascript
showConfirmModal({
    message: '¿Cerrar sesión?',
    onConfirm: () => console.log('Confirmado'),
    onCancel: () => console.log('Cancelado')
});
```

---

## 🆕 Agregar más componentes

Para agregar nuevos componentes reutilizables a esta carpeta:

1. Crea los archivos necesarios (`.js`, `.css`)
2. Impórtalos en `index.html`
3. Documenta su uso en este README
4. Úsalos desde cualquier módulo de la app

---

**Creado por:** Claude Code
**Fecha:** 31/12/2025
