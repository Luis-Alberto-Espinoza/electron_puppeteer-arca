// shared/utils/dateFormats.js

const { DateTime } = require('luxon');

// Formatos comunes
const DD_MM_YYYY = 'dd/MM/yyyy';
const YYYY_MM_DD_HH_MM_SS = 'yyyy-MM-dd HH:mm:ss';
const MMM_DD_YYYY_H_MM_A = 'MMMM dd, yyyy h:mm a';
const ISO_FORMAT = 'yyyy-MM-ddTHH:mm:ss.SSSZ';

function formatDate(date, format = DD_MM_YYYY) {
  if (!date) return '';

   const dateTime = date instanceof Date ? DateTime.fromJSDate(date) : DateTime.fromISO(date);


  if (!dateTime.isValid) {
    console.error("Fecha inválida:", date);
    return 'Fecha Inválida'; // o un valor por defecto
  }
  return dateTime.toFormat(format);
}

module.exports = {
  DD_MM_YYYY,
  YYYY_MM_DD_HH_MM_SS,
  MMM_DD_YYYY_H_MM_A,
  ISO_FORMAT,
  formatDate
};