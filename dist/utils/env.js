"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProduction = exports.isDryRun = exports.env = void 0;
exports.validateEnv = validateEnv;
require("dotenv/config");
const zod_1 = require("zod");
const logging_1 = require("./logging");
// Esquema para validación de variables de entorno
const envSchema = zod_1.z.object({
    BINANCE_KEY: zod_1.z.string().min(1, 'BINANCE_KEY es requerida'),
    BINANCE_SECRET: zod_1.z.string().min(1, 'BINANCE_SECRET es requerida'),
    LUNAR_KEY: zod_1.z.string().min(1, 'LUNAR_KEY es requerida'),
    DEEPSEEK_API_KEY: zod_1.z.string().min(1, 'DEEPSEEK_API_KEY es requerida'),
    // Variables opcionales con valores por defecto
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: zod_1.z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
    DRY_RUN: zod_1.z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
    // Variables para monitoreo y seguimiento de errores
    SENTRY_DSN: zod_1.z.string().optional().default(''),
    SENTRY_ENVIRONMENT: zod_1.z.string().optional().default('development')
});
// Función para validar y extraer variables de entorno
function validateEnv() {
    try {
        // Validar variables de entorno
        const env = envSchema.parse(process.env);
        logging_1.logger.info('Variables de entorno validadas correctamente');
        return env;
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            // Formatear los errores para mostrarlos claramente
            logging_1.logger.error('Error validando variables de entorno:');
            for (const issue of error.issues) {
                logging_1.logger.error(`- ${issue.path.join('.')}: ${issue.message}`);
            }
            process.exit(1); // Salir con error
        }
        logging_1.logger.error('Error inesperado validando variables de entorno', error);
        process.exit(1);
    }
}
// Exportar las variables validadas para uso en la aplicación
exports.env = validateEnv();
// Exportar flag de modo simulación (DRY_RUN)
exports.isDryRun = exports.env.DRY_RUN;
// Exportar función de utilidad para determinar si estamos en modo producción
exports.isProduction = exports.env.NODE_ENV === 'production';
