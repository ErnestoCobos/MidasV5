import { z } from 'zod';
import { logger } from './logging';

// Esquemas comunes
export const symbolSchema = z.string()
  .min(2, 'Símbolo debe tener al menos 2 caracteres')
  .regex(/^[A-Z0-9]+$/, 'Símbolo debe contener solo letras mayúsculas y números');

export const priceSchema = z.number()
  .positive('El precio debe ser positivo')
  .finite('El precio debe ser un número finito');

export const timestampSchema = z.number()
  .int('El timestamp debe ser un entero')
  .min(1000000000000, 'El timestamp debe estar en milisegundos');

// Esquema básico para datos de mercado
export const marketDataSchema = z.object({
  price: priceSchema,
  volume24h: z.number().positive('El volumen debe ser positivo'),
  sentiment: z.number().min(0).max(100, 'El sentimiento debe estar entre 0 y 100'),
  technicals: z.object({
    rsi: z.number().min(0).max(100).optional(),
    ema_cross: z.enum(['bullish', 'bearish', 'neutral']).optional(),
    volume_ratio: z.number().positive().optional(),
    bband_percent: z.number().min(0).max(1).optional(),
    supports: z.array(z.number().positive()).optional(),
    resistances: z.array(z.number().positive()).optional()
  }).optional()
});

// Esquema para opciones de estrategia
export const strategyConfigSchema = z.object({
  ignoreMarketConditions: z.boolean().optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  allowBearishOperations: z.boolean().optional()
});

// Esquema para señales de trading
export const tradeSignalSchema = z.object({
  action: z.enum(['BUY', 'SELL', 'HOLD']),
  confidence: z.number().min(0).max(1),
  entry: z.number().optional().nullable(),
  stopLoss: z.number().optional().nullable(),
  takeProfit: z.number().optional().nullable(),
  position_size: z.number().optional().nullable(),
  reasoning: z.string().optional(),
  trailingStopPercent: z.number().optional().nullable(),
  useTrailingStop: z.boolean().optional().nullable()
}).transform(data => ({
  action: data.action,
  confidence: data.confidence,
  entry: data.entry || undefined,
  stopLoss: data.stopLoss || undefined,
  takeProfit: data.takeProfit || undefined,
  position_size: data.position_size || undefined,
  reasoning: data.reasoning,
  trailingStopPercent: data.trailingStopPercent || undefined,
  useTrailingStop: data.useTrailingStop || undefined
}));

/**
 * Función helper para validar datos con manejo de errores consistente
 * @param schema Esquema Zod para validar
 * @param data Datos a validar
 * @param context Contexto de la validación (para logs)
 * @returns Datos validados y transformados
 * @throws Error si la validación falla
 */
export function validateData<T>(schema: z.ZodType<T>, data: unknown, context: string): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error({
        context,
        validationErrors: error.errors,
        data
      }, 'Error de validación de datos');
      
      // Crear un error más informativo
      const errorMessage = error.errors.map(e => 
        `${e.path.join('.')}: ${e.message}`).join('; ');
      
      throw new Error(`Validación fallida en ${context}: ${errorMessage}`);
    }
    throw error;
  }
}

/**
 * Validador de parámetros para APIs
 * Proporciona un wrapper para validar automáticamente parámetros de función
 * @param validators Objeto con las validaciones para cada parámetro
 * @returns Función decoradora
 */
export function validateParams(validators: Record<string, z.ZodType<any>>) {
  return function(
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = function(...args: any[]) {
      const paramNames = Object.keys(validators);
      
      // Validar cada parámetro contra su esquema
      for (let i = 0; i < paramNames.length; i++) {
        const paramName = paramNames[i];
        const schema = validators[paramName];
        const value = args[i];
        
        try {
          args[i] = schema.parse(value);
        } catch (error) {
          if (error instanceof z.ZodError) {
            const errorMessage = error.errors.map(e =>
              `${paramName}.${e.path.join('.')}: ${e.message}`).join('; ');
              
            logger.error({
              method: _propertyKey,
              param: paramName,
              value,
              errors: error.errors.map(e => ({ path: e.path, message: e.message }))
            }, 'Parámetro inválido');
            
            throw new Error(`Parámetro inválido "${paramName}" en ${_propertyKey}: ${errorMessage}`);
          }
          throw error;
        }
      }
      
      // Llamar al método original con los parámetros validados
      return originalMethod.apply(this, args);
    };
    
    return descriptor;
  };
}

/**
 * Verifica que un valor cumpla con un esquema Zod y lanza un error descriptivo si no
 * @param value Valor a verificar
 * @param schema Esquema Zod
 * @param name Nombre del valor (para el mensaje de error)
 * @throws Error si el valor no cumple con el esquema
 */
export function ensureValid<T>(value: unknown, schema: z.ZodType<T>, name: string): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ');
      throw new Error(`${name} inválido: ${issues}`);
    }
    throw error;
  }
}
