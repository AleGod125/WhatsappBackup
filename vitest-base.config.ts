import { defineConfig } from 'vitest/config';

/**
 * Cuántos procesos ejecutan las pruebas a la vez.
 *
 * POR QUE HACE FALTA FIJARLO
 * --------------------------
 * Vitest reparte los archivos entre procesos hijos y, por defecto, abre tantos
 * como núcleos tenga la máquina. Cada uno carga el bundle de Angular entero.
 * Al pasar de 25 archivos de prueba, esos hijos empezaron a morir con
 * `Zone Allocation failed - process out of memory`.
 *
 * El síntoma engaña: los fallos aparecían en archivos distintos en cada
 * ejecución — una prueba de vinculación, otra del sidebar, otra del bubble de
 * mensajes — y ninguno tenía nada que ver con el cambio que se estaba
 * probando. No era código intermitente: era memoria.
 *
 * Con un archivo cada vez y memoria de sobra en el proceso, la suite termina
 * siempre. Y termina antes que cuando se peleaban entre ellos: 5 segundos
 * frente a los 25-45 de las ejecuciones que además fallaban.
 */
export default defineConfig({
  test: {
    // Un archivo cada vez. Es lo único que se le pide a una suite: que si
    // falla, sea por el código.
    fileParallelism: false,
    // `poolOptions` desapareció en Vitest 4; ahora son opciones de primer
    // nivel.
    maxWorkers: 1,
    minWorkers: 1,
  },
});
