// Este archivo se ejecuta en un worker thread para procesar tareas en paralelo
// Se carga desde worker-pool.ts

// Importar pool que maneja la configuración del worker
require('./worker-pool');

// Notificar que el worker está listo
const { parentPort } = require('worker_threads');
if (parentPort) {
  parentPort.postMessage({ type: 'ready' });
}
