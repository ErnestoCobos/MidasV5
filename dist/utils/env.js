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
    SENTRY_ENVIRONMENT: zod_1.z.string().optional().default('development'),
    // Variables para PostgreSQL
    DATABASE_URL: zod_1.z.string().optional().default('postgres://vultradmin:AVNS_zBGNTQuTGII6zzEqP8i@vultr-prod-c887c024-0af5-4d3e-811c-063368f8c475-vultr-prod-09bb.vultrdb.com:16751/defaultdb'),
    DATABASE_SSL: zod_1.z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
    DATABASE_MAX_CONNECTIONS: zod_1.z.string().default('20').transform(val => parseInt(val, 10)),
    DATABASE_IDLE_TIMEOUT: zod_1.z.string().default('30000').transform(val => parseInt(val, 10)),
    // Variables para migración de datos
    MIGRATE_DATA: zod_1.z.enum(['true', 'false']).default('false').transform(val => val === 'true'),
    BACKUP_JSON_FILES: zod_1.z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
    // Variables para TimescaleDB
    USE_TIMESCALE: zod_1.z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
    TIMESCALE_CHUNK_INTERVAL_DAYS: zod_1.z.string().default('1').transform(val => parseInt(val, 10)),
    TIMESCALE_COMPRESSION_AFTER_DAYS: zod_1.z.string().default('7').transform(val => parseInt(val, 10))
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
