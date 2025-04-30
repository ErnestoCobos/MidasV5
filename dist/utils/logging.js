"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiLogger = exports.tradeLogger = exports.logger = void 0;
exports.createContextLogger = createContextLogger;
const pino_1 = __importDefault(require("pino"));
// Configuración de logs con formato legible en desarrollo
exports.logger = (0, pino_1.default)({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
        }
    }
});
// Función para crear un logger con contexto
function createContextLogger(context, data = {}) {
    return exports.logger.child(Object.assign({ context }, data));
}
// Logger especializado para métricas de trading
exports.tradeLogger = createContextLogger('trade');
// Logger para eventos de API
exports.apiLogger = createContextLogger('api');
