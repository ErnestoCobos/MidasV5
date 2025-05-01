# WhatsApp-MCP-Notify
# Envía notificaciones automáticas vía WhatsApp al completar tareas en MidasTS,
# utilizando el MCP server de WhatsApp para entregar mensajes enriquecidos.

## When
on_command: task_done         # Se dispara al ejecutar 'cline task_done'
on_command: commit            # Opcional: también tras un commit exitoso

## Steps
1. **Recopilar información**
   ```bash
   # Obtener detalles de proyecto y commit
   PROJECT_ROOT=$(git rev-parse --show-toplevel)
   PROJECT_NAME=$(basename "$PROJECT_ROOT")
   BRANCH=$(git branch --show-current)
   COMMIT_HASH=$(git log -1 --pretty=format:'%h')
   COMMIT_MSG=$(git log -1 --pretty=format:'%s')
   COMMIT_AUTHOR=$(git log -1 --pretty=format:'%an')
   CHANGED_FILES=$(git diff-tree --no-commit-id --name-only -r HEAD | wc -l | xargs)
   COMMIT_DATE=$(git log -1 --pretty=format:'%ci')
   
   # Extraer contexto relevante según carpetas afectadas
   MAIN_MODULE=$(git diff-tree --no-commit-id --name-only -r HEAD | grep -E '^src/[^/]+/' | cut -d'/' -f2 | sort | uniq -c | sort -nr | head -1 | awk '{print $2}')
   if [[ -z "$MAIN_MODULE" ]]; then
     MAIN_MODULE="project"
   fi
   ```

2. **Construir mensaje enriquecido**
   ```bash
   MESSAGE="✅ *MidasTS: Tarea completada*\n\n"
   MESSAGE+="📝 *Commit:* \`${COMMIT_HASH}\` - ${COMMIT_MSG}\n"
   MESSAGE+="👤 *Autor:* ${COMMIT_AUTHOR}\n"
   MESSAGE+="🌿 *Rama:* ${BRANCH}\n"
   MESSAGE+="📂 *Archivos:* ${CHANGED_FILES} modificados\n"
   MESSAGE+="🔄 *Módulo principal:* ${MAIN_MODULE}\n"
   MESSAGE+="🕒 *Fecha:* ${COMMIT_DATE}"
   
   # Añadir estado de test si están presentes
   if [[ -f "coverage/coverage-summary.json" ]]; then
     COVERAGE=$(jq -r '.total.lines.pct' coverage/coverage-summary.json 2>/dev/null || echo "N/A")
     MESSAGE+="\n📊 *Cobertura:* ${COVERAGE}%"
   fi
   ```

3. **Determinar destinatario**
   ```bash
   # Usar variable de entorno o valor por defecto
   RECIPIENT=${WHATSAPP_NOTIFY_TO:-"cobos@s.whatsapp.net"}
   
   # Verificar si las notificaciones están desactivadas
   if [[ "${WHATSAPP_NOTIFY_OFF}" == "1" ]]; then
     echo "ℹ️ Notificaciones WhatsApp desactivadas (WHATSAPP_NOTIFY_OFF=1)"
     exit 0
   fi
   ```

4. **Enviar mensaje vía MCP**
   ```bash
   # Invocar MCP para enviar mensaje
   MCP_RESPONSE=$(use_mcp_tool \
     --server "github.com/lharries/whatsapp-mcp" \
     --tool "send_message" \
     --args "{\"recipient\":\"${RECIPIENT}\",\"message\":\"${MESSAGE}\"}" 2>/dev/null)
   
   # Verificar resultado
   if echo "$MCP_RESPONSE" | grep -q "\"status\":\"success\""; then
     echo "✅ Notificación WhatsApp enviada a ${RECIPIENT##*@}"
   else
     ERROR=$(echo "$MCP_RESPONSE" | jq -r '.error // "Error desconocido"' 2>/dev/null || echo "Error al procesar respuesta")
     echo "❌ Error enviando WhatsApp: $ERROR"
   fi
   ```

5. **Registro en log file (opcional)**
   ```bash
   # Guardar historial de notificaciones para referencia
   LOG_DIR="${PROJECT_ROOT}/.logs"
   mkdir -p "$LOG_DIR"
   echo "[$(date '+%Y-%m-%d %H:%M:%S')] WhatsApp enviado: ${COMMIT_HASH} - ${COMMIT_MSG}" >> "${LOG_DIR}/notifications.log"
   ```

## Fail-level
warn          # No bloquea el flujo pero advierte si falla

## Config
```yaml
# Configuración por defecto
default_recipient: "+528712846059@s.whatsapp.net"    # Destinatario principal
fallback_recipients: []                      # Lista de respaldo (opcional)
include_test_coverage: true                  # Incluir métricas de pruebas
include_file_list: false                     # Incluir lista de archivos modificados
log_history: true                            # Guardar historial de notificaciones
max_files_to_list: 5                         # Máximo de archivos a listar en mensaje
notification_emoji: "✅"                      # Emoji principal para notificación
```

## Variables de entorno
| Variable             | Propósito                                      |
| -------------------- | ---------------------------------------------- |
| `WHATSAPP_NOTIFY_TO` | Sobreescribir destinatario por defecto         |
| `WHATSAPP_NOTIFY_OFF`| Desactivar notificaciones temporalmente        |

## Ejemplos de uso
```bash
# Uso normal al completar tarea
cline task_done

# Envío manual a destinatario específico
WHATSAPP_NOTIFY_TO="otrocontacto@s.whatsapp.net" cline task_done

# Desactivar notificaciones temporalmente
WHATSAPP_NOTIFY_OFF=1 cline task_done
```

## Problemas comunes
- **El servidor WhatsApp MCP no está ejecutándose**:
  Inicia el servidor con `npx -y @whatsapp-mcp/server` en una terminal separada
  
- **Error "Unknown recipient"**:
  Asegúrate que el contacto esté en tu WhatsApp y usa el formato correcto (número@s.whatsapp.net)
  
- **Mensaje no llega**:
  Verifica el estado de conexión del servidor MCP y que WhatsApp Web esté sincronizado
