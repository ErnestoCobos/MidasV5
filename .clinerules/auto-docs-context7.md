# Objetivo  
Cada vez que tu código Node incorpore o modifique un `import`/`require`, o cuando el prompt pregunte por una librería/framework, Cline debe:

1. Obtener la documentación oficial más reciente vía **Context7 MCP**.  
2. Adjuntar un resumen + enlace en un bloque colapsable.  
3. Alertar si el módulo o API está deprecado.  
4. Bloquear el commit si hay advertencias sin revisar.

## Prerrequisitos  
- Tener configurado el servidor MCP `context7` (por ejemplo, en `~/.cline/mcp.json`):

  ```jsonc
  {
    "mcpServers": {
      "context7": {
        "command": "npx",
        "args": ["-y", "@upstash/context7-mcp"]
      }
    }
  }