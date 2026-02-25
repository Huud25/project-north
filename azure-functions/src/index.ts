// Entry point do Azure Functions (programming model v4).
// IMPORTANTE: cada function só é registrada quando o módulo é carregado.
// Por isso, precisamos importar explicitamente todos os arquivos de functions aqui.

import "./functions/EvaluateNorth.js";
import "./functions/NorthMetrics.js";