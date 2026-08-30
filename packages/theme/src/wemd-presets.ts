/**
 * WeMD 主题移植（自动生成自 tenngoxars/WeMD 的 CSS 主题）。
 * 已转换为 stylewx 的结构化 Theme（tokens + blocks），只保留微信白名单内属性。
 * 样式为近似的「视觉迁移」：无法 1:1 还原 WeMD 的 class/flex/box-shadow 等微信会过滤的特性。
 */
import type { Theme } from './schema.js'

export const WEMD_THEMES: Theme[] = [
{
  "name": "basic",
  "description": "默认基础：WeMD 默认最佳实践：朴素黑字、清晰层级，适合通用内容。",
  "tokens": {
    "primaryColor": "#1e6bb8",
    "textColor": "#000000",
    "fontSize": "16px",
    "lineHeight": 1.6,
    "fontFamily": "Optima-Regular, Optima, PingFangSC-light, PingFangTC-light, 'PingFang SC', 'Microsoft YaHei', '微软雅黑', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "margin-top": "30px",
      "margin-bottom": "15px",
      "padding": "0px",
      "font-weight": "bold",
      "color": "#000000",
      "font-size": "24px"
    },
    "h2": {
      "margin-top": "30px",
      "margin-bottom": "15px",
      "padding": "0px",
      "font-weight": "bold",
      "color": "#000000",
      "font-size": "22px"
    },
    "h3": {
      "margin-top": "30px",
      "margin-bottom": "15px",
      "padding": "0px",
      "font-weight": "bold",
      "color": "#000000",
      "font-size": "20px"
    },
    "p": {
      "font-size": "16px",
      "margin": "0",
      "line-height": "26px",
      "color": "#000000"
    },
    "blockquote": {
      "border": "none"
    },
    "ul": {
      "margin-top": "8px",
      "margin-bottom": "8px",
      "padding-left": "25px",
      "color": "#000000",
      "list-style-type": "disc"
    },
    "ol": {
      "margin-top": "8px",
      "margin-bottom": "8px",
      "padding-left": "25px",
      "color": "#000000",
      "list-style-type": "decimal"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "display": "block",
      "font-family": "Operator Mono, Consolas, Monaco, Menlo, monospace",
      "border-radius": "4px",
      "font-size": "14px",
      "white-space": "pre",
      "min-width": "max-content",
      "word-wrap": "break-word",
      "padding": "2px 4px",
      "margin": "0 2px",
      "color": "#1e6bb8",
      "background-color": "rgba(27,31,35,.05)",
      "word-break": "break-all"
    },
    "pre": {
      "margin-top": "10px",
      "margin-bottom": "10px",
      "overflow-x": "auto"
    },
    "img": {
      "display": "block",
      "margin": "0 auto",
      "max-width": "100%"
    },
    "figcaption": {
      "margin-top": "5px",
      "text-align": "center",
      "color": "#888",
      "font-size": "14px"
    },
    "hr": {
      "height": "1px",
      "margin": "0",
      "margin-top": "10px",
      "margin-bottom": "10px",
      "border": "none",
      "border-top": "1px solid black"
    },
    "a": {
      "text-decoration": "none",
      "color": "#1e6bb8",
      "word-wrap": "break-word",
      "font-weight": "bold",
      "border-bottom": "1px solid #1e6bb8"
    },
    "strong": {
      "font-weight": "bold",
      "color": "#000000"
    }
  }
},
{
  "name": "code-github",
  "description": "GitHub 代码：GitHub 风代码高亮基调，强调代码可读性。",
  "tokens": {
    "primaryColor": "#1e6bb8",
    "textColor": "#333333",
    "fontSize": "16px",
    "lineHeight": 1.6,
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "color": "{{primaryColor}}",
      "font-size": "1.6em",
      "font-weight": "600",
      "line-height": "1.35",
      "margin": "0 0 {{spacing.block}}",
      "border-left": "5px solid #0b6bff",
      "padding-left": "12px"
    },
    "h2": {
      "color": "{{primaryColor}}",
      "font-size": "1.35em",
      "font-weight": "600",
      "line-height": "1.4",
      "margin": "0 0 {{spacing.block}}",
      "border-left": "3px solid #0b6bff",
      "padding-left": "10px"
    },
    "h3": {
      "color": "{{primaryColor}}",
      "font-size": "1.15em",
      "font-weight": "600",
      "line-height": "1.4",
      "margin": "0 0 {{spacing.block}}"
    },
    "p": {
      "color": "{{textColor}}",
      "font-size": "{{fontSize}}",
      "line-height": "{{lineHeight}}",
      "margin": "0 0 {{spacing.block}}"
    },
    "blockquote": {
      "border-left": "4px solid {{primaryColor}}",
      "background-color": "#f5f9ff",
      "color": "#3a4a5a",
      "padding": "12px 16px",
      "margin": "0 0 {{spacing.block}}",
      "border-radius": "4px"
    },
    "ul": {
      "padding-left": "1.4em",
      "margin": "0 0 {{spacing.block}}",
      "list-style": "disc"
    },
    "ol": {
      "padding-left": "1.4em",
      "margin": "0 0 {{spacing.block}}"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "font-family": "Menlo, Consolas, \"Courier New\", monospace",
      "font-size": "0.9em",
      "background-color": "#f0f4ff",
      "color": "#3b5b9a",
      "padding": "2px 5px",
      "border-radius": "4px"
    },
    "pre": {
      "background-color": "#f0f4ff",
      "padding": "16px",
      "border-radius": "6px",
      "overflow-x": "auto",
      "font-size": "0.88em",
      "line-height": "1.6",
      "font-family": "Menlo, Consolas, \"Courier New\", monospace",
      "color": "#3b5b9a",
      "margin": "0 0 {{spacing.block}}"
    },
    "img": {
      "max-width": "100%",
      "height": "auto",
      "display": "block",
      "border-radius": "4px",
      "margin": "0 auto {{spacing.block}}"
    },
    "figcaption": {
      "font-size": "0.85em",
      "color": "#8a94a6",
      "text-align": "center",
      "margin-top": "8px"
    },
    "hr": {
      "border": "none",
      "border-top": "1px solid #e2e8f0",
      "margin": "24px 0"
    },
    "a": {
      "color": "{{primaryColor}}",
      "text-decoration": "none",
      "border-bottom": "1px solid {{primaryColor}}"
    },
    "strong": {
      "color": "{{primaryColor}}",
      "font-weight": "600"
    }
  }
},
{
  "name": "code-github-dark",
  "description": "GitHub 深色代码：深色代码块、暖色注释，适合技术示例。",
  "tokens": {
    "primaryColor": "#1e6bb8",
    "textColor": "#333333",
    "fontSize": "16px",
    "lineHeight": 1.6,
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "color": "{{primaryColor}}",
      "font-size": "1.6em",
      "font-weight": "600",
      "line-height": "1.35",
      "margin": "0 0 {{spacing.block}}",
      "border-left": "5px solid #0b6bff",
      "padding-left": "12px"
    },
    "h2": {
      "color": "{{primaryColor}}",
      "font-size": "1.35em",
      "font-weight": "600",
      "line-height": "1.4",
      "margin": "0 0 {{spacing.block}}",
      "border-left": "3px solid #0b6bff",
      "padding-left": "10px"
    },
    "h3": {
      "color": "{{primaryColor}}",
      "font-size": "1.15em",
      "font-weight": "600",
      "line-height": "1.4",
      "margin": "0 0 {{spacing.block}}"
    },
    "p": {
      "color": "{{textColor}}",
      "font-size": "{{fontSize}}",
      "line-height": "{{lineHeight}}",
      "margin": "0 0 {{spacing.block}}"
    },
    "blockquote": {
      "border-left": "4px solid {{primaryColor}}",
      "background-color": "#f5f9ff",
      "color": "#3a4a5a",
      "padding": "12px 16px",
      "margin": "0 0 {{spacing.block}}",
      "border-radius": "4px"
    },
    "ul": {
      "padding-left": "1.4em",
      "margin": "0 0 {{spacing.block}}",
      "list-style": "disc"
    },
    "ol": {
      "padding-left": "1.4em",
      "margin": "0 0 {{spacing.block}}"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "font-family": "Menlo, Consolas, \"Courier New\", monospace",
      "font-size": "0.9em",
      "background-color": "#f0f4ff",
      "color": "#3b5b9a",
      "padding": "2px 5px",
      "border-radius": "4px"
    },
    "pre": {
      "background-color": "#f0f4ff",
      "padding": "16px",
      "border-radius": "6px",
      "overflow-x": "auto",
      "font-size": "0.88em",
      "line-height": "1.6",
      "font-family": "Menlo, Consolas, \"Courier New\", monospace",
      "color": "#3b5b9a",
      "margin": "0 0 {{spacing.block}}"
    },
    "img": {
      "max-width": "100%",
      "height": "auto",
      "display": "block",
      "border-radius": "4px",
      "margin": "0 auto {{spacing.block}}"
    },
    "figcaption": {
      "font-size": "0.85em",
      "color": "#8a94a6",
      "text-align": "center",
      "margin-top": "8px"
    },
    "hr": {
      "border": "none",
      "border-top": "1px solid #e2e8f0",
      "margin": "24px 0"
    },
    "a": {
      "color": "{{primaryColor}}",
      "text-decoration": "none",
      "border-bottom": "1px solid {{primaryColor}}"
    },
    "strong": {
      "color": "{{primaryColor}}",
      "font-weight": "600"
    }
  }
},
{
  "name": "custom-default",
  "description": "翡翠刊读：深松墨标题 + 翡翠锚点，编辑节奏清晰。",
  "tokens": {
    "primaryColor": "#047857",
    "textColor": "#242a26",
    "fontSize": "16px",
    "lineHeight": 1.8,
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "font-size": "30px",
      "font-weight": "800",
      "color": "#12241c",
      "text-align": "left",
      "margin": "10px 0 28px",
      "padding-top": "18px",
      "border-top": "3px solid #047857",
      "line-height": "1.35",
      "letter-spacing": "-0.3px"
    },
    "h2": {
      "font-size": "22px",
      "font-weight": "700",
      "color": "#134034",
      "margin": "42px 0 16px",
      "padding-bottom": "10px",
      "border-bottom": "2px solid #cfe4d9",
      "line-height": "1.45",
      "letter-spacing": "0.2px"
    },
    "h3": {
      "font-size": "18px",
      "font-weight": "600",
      "color": "#134034",
      "margin": "30px 0 12px",
      "padding-left": "12px",
      "border-left": "3px solid #047857",
      "line-height": "1.5",
      "letter-spacing": "0.2px"
    },
    "p": {
      "margin": "16px 0",
      "font-size": "16px",
      "color": "#242a26",
      "line-height": "1.8",
      "letter-spacing": "0.4px"
    },
    "blockquote": {
      "border-left": "4px solid {{primaryColor}}",
      "background-color": "#f5f9ff",
      "color": "#3a4a5a",
      "padding": "12px 16px",
      "margin": "0 0 {{spacing.block}}",
      "border-radius": "4px"
    },
    "ul": {
      "padding-left": "24px",
      "list-style-type": "disc",
      "color": "#242a26"
    },
    "ol": {
      "padding-left": "24px",
      "list-style-type": "decimal",
      "color": "#242a26"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "background": "#f7f9f8",
      "padding": "18px",
      "border-radius": "8px",
      "color": "#334155",
      "font-family": "\"SF Mono\", Monaco, \"Cascadia Code\", \"Roboto Mono\", Consolas, monospace",
      "font-size": "13.5px",
      "margin": "0 2px",
      "border": "1px solid #e4e9e6",
      "display": "block",
      "overflow-x": "auto",
      "line-height": "1.7"
    },
    "pre": {
      "background-color": "#f0f4ff",
      "padding": "16px",
      "border-radius": "6px",
      "overflow-x": "auto",
      "font-size": "0.88em",
      "line-height": "1.6",
      "font-family": "Menlo, Consolas, \"Courier New\", monospace",
      "color": "#3b5b9a",
      "margin": "0 0 {{spacing.block}}"
    },
    "img": {
      "display": "block",
      "margin": "24px auto",
      "max-width": "100%",
      "border-radius": "6px"
    },
    "figcaption": {
      "text-align": "center",
      "font-size": "14px",
      "color": "#606b64",
      "margin-top": "10px",
      "letter-spacing": "0.2px"
    },
    "hr": {
      "border": "none",
      "height": "2px",
      "width": "48px",
      "background": "#047857",
      "margin": "34px auto"
    },
    "a": {
      "color": "#047857",
      "text-decoration": "none",
      "border-bottom": "1px solid rgba(4, 120, 87, 0.4)",
      "font-weight": "500"
    },
    "strong": {
      "font-weight": "700",
      "color": "#12241c",
      "letter-spacing": "0.2px"
    }
  }
},
{
  "name": "academic-paper",
  "description": "学术论文：克制黑白、注释清晰，适合论文导读与研究。",
  "tokens": {
    "primaryColor": "#000080",
    "textColor": "#000",
    "fontSize": "16px",
    "lineHeight": 1.6,
    "fontFamily": "\"Times New Roman\", \"Songti SC\", \"SimSun\", serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "margin": "40px 0 30px",
      "text-align": "center",
      "line-height": "1.4"
    },
    "h2": {
      "margin": "30px 0 15px",
      "text-align": "left",
      "border-bottom": "2px solid #000",
      "padding-bottom": "8px"
    },
    "h3": {
      "margin": "20px 0 10px"
    },
    "p": {
      "margin": "16px 0",
      "line-height": "1.7",
      "text-align": "justify",
      "text-indent": "0",
      "color": "#1a1a1a",
      "font-size": "16px"
    },
    "blockquote": {
      "border-left": "4px solid {{primaryColor}}",
      "background-color": "#f5f9ff",
      "color": "#3a4a5a",
      "padding": "12px 16px",
      "margin": "0 0 {{spacing.block}}",
      "border-radius": "4px"
    },
    "ul": {
      "list-style": "disc",
      "padding-left": "20px",
      "margin": "16px 0"
    },
    "ol": {
      "list-style": "decimal",
      "padding-left": "20px",
      "margin": "16px 0"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "color": "#000",
      "background": "#f9f9f9",
      "border": "1px solid #ccc",
      "padding": "12px",
      "margin": "0 2px",
      "border-radius": "0",
      "font-size": "13px",
      "font-family": "\"Courier New\", monospace",
      "overflow-x": "auto",
      "white-space": "pre",
      "min-width": "max-content"
    },
    "pre": {
      "background-color": "#f0f4ff",
      "padding": "16px",
      "border-radius": "6px",
      "overflow-x": "auto",
      "font-size": "0.88em",
      "line-height": "1.6",
      "font-family": "Menlo, Consolas, \"Courier New\", monospace",
      "color": "#3b5b9a",
      "margin": "0 0 {{spacing.block}}"
    },
    "img": {
      "display": "block",
      "margin": "30px auto",
      "width": "100%",
      "border": "1px solid #ddd"
    },
    "figcaption": {
      "margin-top": "8px",
      "text-align": "center",
      "color": "#666",
      "font-size": "14px",
      "font-style": "italic"
    },
    "hr": {
      "border": "none",
      "border-top": "1px solid #e2e8f0",
      "margin": "24px 0"
    },
    "a": {
      "color": "#000080",
      "text-decoration": "underline"
    },
    "strong": {
      "color": "#000",
      "font-weight": "bold"
    }
  }
},
{
  "name": "aurora-glass",
  "description": "极光玻璃：柔和通透、留白充足，适合审美向内容。",
  "tokens": {
    "primaryColor": "#C850C0",
    "textColor": "#333",
    "fontSize": "16px",
    "lineHeight": 1.6,
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"Helvetica Neue\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "margin-top": "60px",
      "margin-bottom": "50px",
      "text-align": "center"
    },
    "h2": {
      "margin-top": "60px",
      "margin-bottom": "30px",
      "text-align": "left"
    },
    "h3": {
      "margin-top": "35px",
      "margin-bottom": "15px"
    },
    "p": {
      "margin-top": "22px",
      "margin-bottom": "22px",
      "line-height": "1.9",
      "letter-spacing": "0.6px",
      "text-align": "justify",
      "color": "#444",
      "font-size": "16px"
    },
    "blockquote": {
      "border-left": "4px solid {{primaryColor}}",
      "background-color": "#f5f9ff",
      "color": "#3a4a5a",
      "padding": "12px 16px",
      "margin": "0 0 {{spacing.block}}",
      "border-radius": "4px"
    },
    "ul": {
      "list-style-type": "disc",
      "padding-left": "20px",
      "margin": "20px 0",
      "color": "#C850C0"
    },
    "ol": {
      "list-style-type": "decimal",
      "padding-left": "20px",
      "margin": "20px 0",
      "color": "#4158D0",
      "font-weight": "bold"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "color": "#abb2bf",
      "background": "#282c34",
      "border": "1px solid rgba(65, 88, 208, 0.1)",
      "padding": "20px",
      "margin": "0 4px",
      "border-radius": "12px",
      "font-size": "13px",
      "font-family": "sans-serif",
      "display": "block",
      "line-height": "1.6",
      "overflow-x": "auto",
      "white-space": "pre",
      "min-width": "max-content"
    },
    "pre": {
      "background-color": "#f0f4ff",
      "padding": "16px",
      "border-radius": "6px",
      "overflow-x": "auto",
      "font-size": "0.88em",
      "line-height": "1.6",
      "font-family": "Menlo, Consolas, \"Courier New\", monospace",
      "color": "#3b5b9a",
      "margin": "0 0 {{spacing.block}}"
    },
    "img": {
      "display": "block",
      "margin": "40px auto",
      "width": "100%",
      "border-radius": "12px"
    },
    "figcaption": {
      "font-size": "0.85em",
      "color": "#8a94a6",
      "text-align": "center",
      "margin-top": "8px"
    },
    "hr": {
      "margin": "60px auto",
      "border": "0",
      "height": "2px",
      "background-image": "linear-gradient(90deg, rgba(247, 249, 252, 0) 0%, #C850C0 50%, rgba(247, 249, 252, 0) 100%)",
      "width": "80%"
    },
    "a": {
      "color": "#C850C0",
      "text-decoration": "none",
      "border-bottom": "1px dashed #C850C0",
      "font-weight": "600",
      "padding-bottom": "1px"
    },
    "strong": {
      "font-weight": "700",
      "background-image": "linear-gradient(135deg, #4158D0 0%, #C850C0 100%)",
      "background-clip": "text",
      "color": "transparent",
      "margin": "0 1px"
    }
  }
},
{
  "name": "bauhaus",
  "description": "包豪斯：几何感、强对比，适合设计/创意内容。",
  "tokens": {
    "primaryColor": "#D32F2F",
    "textColor": "#111",
    "fontSize": "16px",
    "lineHeight": 1.6,
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"Microsoft YaHei\", sans-serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "margin": "60px 0 40px",
      "text-align": "left"
    },
    "h2": {
      "margin": "50px 0 25px",
      "text-align": "left",
      "display": "flex"
    },
    "h3": {
      "margin": "30px 0 15px"
    },
    "p": {
      "margin": "24px 0",
      "line-height": "1.8",
      "text-align": "justify",
      "color": "#333",
      "font-size": "16px"
    },
    "blockquote": {
      "border-left": "4px solid {{primaryColor}}",
      "background-color": "#f5f9ff",
      "color": "#3a4a5a",
      "padding": "12px 16px",
      "margin": "0 0 {{spacing.block}}",
      "border-radius": "4px"
    },
    "ul": {
      "list-style": "square",
      "padding-left": "20px",
      "margin": "20px 0",
      "color": "#D32F2F"
    },
    "ol": {
      "list-style": "decimal",
      "padding-left": "20px",
      "margin": "20px 0",
      "color": "#D32F2F",
      "font-weight": "bold"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "background": "#111",
      "color": "#f5f5f5",
      "padding": "20px",
      "margin": "0 4px",
      "font-size": "14px",
      "font-weight": "bold",
      "font-family": "monospace",
      "border-radius": "0",
      "border": "2px solid #111"
    },
    "pre": {
      "background-color": "#f0f4ff",
      "padding": "16px",
      "border-radius": "6px",
      "overflow-x": "auto",
      "font-size": "0.88em",
      "line-height": "1.6",
      "font-family": "Menlo, Consolas, \"Courier New\", monospace",
      "color": "#3b5b9a",
      "margin": "0 0 {{spacing.block}}"
    },
    "img": {
      "display": "block",
      "margin": "40px auto",
      "width": "100%",
      "border": "3px solid #111"
    },
    "figcaption": {
      "margin-top": "10px",
      "text-align": "center",
      "color": "#111",
      "font-size": "14px",
      "font-weight": "bold",
      "background": "#FBC02D",
      "padding": "4px 8px",
      "display": "inline-block"
    },
    "hr": {
      "margin": "40px 0",
      "border": "none",
      "height": "4px",
      "background": "#000"
    },
    "a": {
      "color": "#111",
      "text-decoration": "none",
      "background-color": "rgba(25, 118, 210, 0.2)",
      "border-bottom": "1px solid #1976D2",
      "padding": "0 2px",
      "font-weight": "bold"
    },
    "strong": {
      "color": "#D32F2F",
      "font-weight": "900"
    }
  }
},
{
  "name": "cyberpunk-neon",
  "description": "赛博霓虹：深色底霓虹强调，极客与未来感。",
  "tokens": {
    "primaryColor": "#00F3FF",
    "textColor": "#333",
    "fontSize": "16px",
    "lineHeight": 1.6,
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"Microsoft YaHei\", sans-serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "margin": "50px 0 40px",
      "text-align": "center"
    },
    "h2": {
      "margin": "45px 0 25px",
      "text-align": "left"
    },
    "h3": {
      "margin": "30px 0 15px"
    },
    "p": {
      "margin": "22px 0",
      "line-height": "1.75",
      "text-align": "justify",
      "color": "#444",
      "font-size": "16px"
    },
    "blockquote": {
      "border-left": "4px solid {{primaryColor}}",
      "background-color": "#f5f9ff",
      "color": "#3a4a5a",
      "padding": "12px 16px",
      "margin": "0 0 {{spacing.block}}",
      "border-radius": "4px"
    },
    "ul": {
      "list-style": "disc",
      "padding-left": "20px",
      "color": "#00F3FF",
      "margin": "20px 0"
    },
    "ol": {
      "list-style": "decimal",
      "padding-left": "20px",
      "color": "#FF00C1",
      "font-weight": "bold",
      "margin": "20px 0"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "color": "#E6EDF3",
      "background": "#161B22",
      "border": "1px solid #00F3FF",
      "padding": "16px",
      "margin": "0 4px",
      "border-radius": "4px",
      "font-size": "13px",
      "font-family": "\"Courier New\", \"Consolas\", \"Monaco\", monospace",
      "letter-spacing": "0px",
      "border-left": "3px solid #00F3FF",
      "overflow-x": "auto",
      "white-space": "pre",
      "min-width": "max-content"
    },
    "pre": {
      "background-color": "#f0f4ff",
      "padding": "16px",
      "border-radius": "6px",
      "overflow-x": "auto",
      "font-size": "0.88em",
      "line-height": "1.6",
      "font-family": "Menlo, Consolas, \"Courier New\", monospace",
      "color": "#3b5b9a",
      "margin": "0 0 {{spacing.block}}"
    },
    "img": {
      "max-width": "100%",
      "height": "auto",
      "display": "block",
      "border-radius": "4px",
      "margin": "0 auto {{spacing.block}}"
    },
    "figcaption": {
      "margin-top": "10px",
      "text-align": "center",
      "color": "#00F3FF",
      "font-size": "13px",
      "font-family": "monospace"
    },
    "hr": {
      "margin": "50px 0",
      "border": "none",
      "height": "2px",
      "background": "linear-gradient(90deg, transparent, #00F3FF, transparent)"
    },
    "a": {
      "color": "#00F3FF",
      "text-decoration": "none",
      "border-bottom": "1px dashed #00F3FF"
    },
    "strong": {
      "color": "#FF00C1",
      "font-weight": "bold",
      "text-shadow": "0 0 2px rgba(255, 0, 193, 0.4)"
    }
  }
},
{
  "name": "clear-guide",
  "description": "清新导览：明亮轻快、引导感强，适合教程与清单。",
  "tokens": {
    "primaryColor": "#06736a",
    "textColor": "#263b3a",
    "fontSize": "16px",
    "lineHeight": 1.82,
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"PingFang SC\", \"Microsoft YaHei\", sans-serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "padding": "0 0 18px",
      "text-align": "left",
      "margin": "24px 0 44px",
      "border": "none",
      "border-bottom": "8px solid #f0c94d",
      "background": "transparent"
    },
    "h2": {
      "padding": "0 0 9px",
      "text-align": "left",
      "margin": "45px 0 23px",
      "border": "none",
      "border-bottom": "4px solid #172b29",
      "background": "transparent"
    },
    "h3": {
      "padding": "0",
      "text-align": "left",
      "margin": "32px 0 16px",
      "border-bottom": "1px dashed #8eb1ad"
    },
    "p": {
      "margin": "0 0 21px",
      "color": "#263b3a",
      "font-size": "16px",
      "line-height": "1.82",
      "text-align": "left"
    },
    "blockquote": {
      "border": "none"
    },
    "ul": {
      "margin": "20px 0 27px",
      "padding-left": "25px",
      "color": "#087f75"
    },
    "ol": {
      "margin": "20px 0 27px",
      "padding-left": "25px",
      "color": "#087f75"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "padding": "19px 20px",
      "border": "1px solid #b9d0cd",
      "color": "#e8f4f2",
      "background": "#173330",
      "font-family": "\"SFMono-Regular\", Consolas, monospace",
      "font-size": "13px",
      "display": "block",
      "min-width": "max-content",
      "line-height": "1.7",
      "white-space": "pre"
    },
    "pre": {
      "margin": "29px 0",
      "border": "1px solid #183f3c",
      "border-top": "6px solid #23a79b",
      "background": "#173330",
      "overflow-x": "auto"
    },
    "img": {
      "display": "block",
      "max-width": "100%",
      "height": "auto",
      "margin": "0 auto"
    },
    "figcaption": {
      "margin-top": "0",
      "padding": "9px 12px",
      "color": "#ffffff",
      "background": "#172b29",
      "font-size": "12px",
      "line-height": "1.65",
      "text-align": "left"
    },
    "hr": {
      "height": "1px",
      "margin": "44px 0",
      "border": "none",
      "background": "#9bbdb9"
    },
    "a": {
      "color": "#06736a",
      "font-weight": "650",
      "text-decoration": "underline"
    },
    "strong": {
      "color": "#064c47",
      "font-weight": "750"
    }
  }
},
{
  "name": "data-blueprint",
  "description": "数据蓝图：理性蓝调、数据感，适合报表与洞察。",
  "tokens": {
    "primaryColor": "#175da8",
    "textColor": "#203047",
    "fontSize": "15px",
    "lineHeight": 1.72,
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"PingFang SC\", \"Microsoft YaHei\", sans-serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "padding": "27px 24px 25px",
      "text-align": "left",
      "margin": "18px 0 34px",
      "border": "none",
      "background": "#102b4e"
    },
    "h2": {
      "padding": "0 0 7px",
      "text-align": "left",
      "margin": "42px 0 20px",
      "border-bottom": "2px solid #173f7a",
      "background": "transparent"
    },
    "h3": {
      "padding": "0",
      "text-align": "left",
      "margin": "29px 0 14px",
      "border": "none"
    },
    "p": {
      "margin": "0 0 18px",
      "color": "#203047",
      "font-size": "15px",
      "line-height": "1.72",
      "text-align": "left"
    },
    "blockquote": {
      "border": "none"
    },
    "ul": {
      "margin": "18px 0 24px",
      "padding-left": "25px",
      "color": "#a84317",
      "list-style-type": "square"
    },
    "ol": {
      "margin": "18px 0 24px",
      "padding-left": "25px",
      "color": "#a84317",
      "font-family": "\"SFMono-Regular\", Consolas, monospace",
      "list-style-type": "decimal-leading-zero"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "padding": "19px 20px",
      "border": "1px solid #c7d2df",
      "color": "#eaf1f8",
      "background": "#13233a",
      "font-family": "\"SFMono-Regular\", Consolas, monospace",
      "font-size": "13px",
      "display": "block",
      "min-width": "max-content",
      "line-height": "1.7",
      "white-space": "pre"
    },
    "pre": {
      "margin": "30px 0",
      "border": "1px solid #173f7a",
      "border-top": "6px solid #a84317",
      "background": "#13233a",
      "overflow-x": "auto"
    },
    "img": {
      "display": "block",
      "max-width": "100%",
      "height": "auto",
      "margin": "0 auto",
      "padding": "5px",
      "border": "1px solid #aebdce",
      "background": "#ffffff"
    },
    "figcaption": {
      "margin-top": "0",
      "padding": "8px 10px",
      "color": "#536a84",
      "background": "#edf3f8",
      "font-family": "\"SFMono-Regular\", Consolas, monospace",
      "font-size": "11px",
      "line-height": "1.6",
      "text-align": "left"
    },
    "hr": {
      "height": "0",
      "margin": "38px 0",
      "border": "none",
      "border-top": "1px dashed #7790ac",
      "background": "transparent"
    },
    "a": {
      "color": "#175da8",
      "font-weight": "600",
      "text-decoration": "underline",
      "text-decoration-color": "#8bb4df"
    },
    "strong": {
      "color": "#142e55",
      "font-weight": "750"
    }
  }
},
{
  "name": "eastern-notes",
  "description": "东方笔记：温润留白，适合人文与随笔。",
  "tokens": {
    "primaryColor": "#8c3025",
    "textColor": "#36322f",
    "fontSize": "17px",
    "lineHeight": 2.06,
    "fontFamily": "\"Songti SC\", \"STSong\", \"Noto Serif CJK SC\", SimSun, serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "text-align": "right",
      "max-width": "7em",
      "margin": "38px 0 72px auto",
      "padding": "0 8px 0 0",
      "border": "none"
    },
    "h2": {
      "text-align": "right",
      "margin": "58px 0 30px",
      "padding": "0 8px 0 0",
      "border": "none"
    },
    "h3": {
      "text-align": "left",
      "margin": "40px 0 21px 2em"
    },
    "p": {
      "margin": "0 0 29px",
      "color": "#36322f",
      "font-size": "17px",
      "line-height": "2.06",
      "text-align": "justify"
    },
    "blockquote": {
      "border": "none"
    },
    "ul": {
      "margin": "22px 0 28px",
      "padding-left": "25px",
      "color": "#a33a2b"
    },
    "ol": {
      "margin": "22px 0 28px",
      "padding-left": "25px",
      "color": "#a33a2b"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "padding": "20px",
      "border": "1px solid #d4cbc3",
      "color": "#f0ece7",
      "background": "#2e2a27",
      "font-family": "\"SFMono-Regular\", Consolas, monospace",
      "font-size": "13px",
      "display": "block",
      "min-width": "max-content",
      "line-height": "1.72",
      "white-space": "pre"
    },
    "pre": {
      "margin": "32px 0",
      "border": "1px solid #403a35",
      "border-top": "6px solid #a33a2b",
      "background": "#2e2a27",
      "overflow-x": "auto"
    },
    "img": {
      "display": "block",
      "max-width": "100%",
      "height": "auto",
      "margin": "0 auto"
    },
    "figcaption": {
      "margin-top": "12px",
      "color": "#746860",
      "font-size": "12px",
      "line-height": "1.8",
      "letter-spacing": "0.08em",
      "text-align": "right"
    },
    "hr": {
      "width": "8px",
      "height": "8px",
      "margin": "64px auto",
      "border": "none",
      "background": "#a33a2b"
    },
    "a": {
      "color": "#8c3025",
      "font-weight": "600",
      "text-decoration": "underline",
      "text-decoration-color": "#c99087"
    },
    "strong": {
      "color": "#272320",
      "font-weight": "700",
      "text-decoration": "underline",
      "text-decoration-color": "#d9aaa2",
      "text-decoration-thickness": "2px"
    }
  }
},
{
  "name": "knowledge-base",
  "description": "知识库：结构化、信息密度友好。",
  "tokens": {
    "primaryColor": "#EB5757",
    "textColor": "#37352F",
    "fontSize": "16px",
    "lineHeight": 1.6,
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"Helvetica Neue\", \"PingFang SC\", sans-serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "margin-top": "50px",
      "margin-bottom": "40px",
      "text-align": "left",
      "border-bottom": "1px solid #E3E2E0",
      "padding-bottom": "20px"
    },
    "h2": {
      "margin-top": "40px",
      "margin-bottom": "20px",
      "text-align": "left"
    },
    "h3": {
      "margin-top": "30px",
      "margin-bottom": "12px"
    },
    "p": {
      "margin-top": "16px",
      "margin-bottom": "16px",
      "line-height": "1.75",
      "letter-spacing": "0.2px",
      "text-align": "justify",
      "color": "#37352F",
      "font-size": "16px"
    },
    "blockquote": {
      "border-left": "4px solid {{primaryColor}}",
      "background-color": "#f5f9ff",
      "color": "#3a4a5a",
      "padding": "12px 16px",
      "margin": "0 0 {{spacing.block}}",
      "border-radius": "4px"
    },
    "ul": {
      "list-style-type": "disc",
      "padding-left": "24px",
      "margin": "16px 0",
      "color": "#37352F"
    },
    "ol": {
      "list-style-type": "decimal",
      "padding-left": "24px",
      "margin": "16px 0",
      "color": "#37352F",
      "font-weight": "600"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "color": "#EB5757",
      "background": "#F7F6F3",
      "border": "none",
      "padding": "20px",
      "margin": "0 4px",
      "border-radius": "4px",
      "font-size": "13px",
      "font-family": "\"SFMono-Regular\", Consolas, Menlo, monospace",
      "display": "block",
      "line-height": "1.6",
      "overflow-x": "auto",
      "white-space": "pre",
      "min-width": "max-content"
    },
    "pre": {
      "background-color": "#f0f4ff",
      "padding": "16px",
      "border-radius": "6px",
      "overflow-x": "auto",
      "font-size": "0.88em",
      "line-height": "1.6",
      "font-family": "Menlo, Consolas, \"Courier New\", monospace",
      "color": "#3b5b9a",
      "margin": "0 0 {{spacing.block}}"
    },
    "img": {
      "display": "block",
      "margin": "30px auto",
      "width": "100%",
      "border-radius": "4px",
      "border": "1px solid #E3E2E0"
    },
    "figcaption": {
      "margin-top": "8px",
      "text-align": "center",
      "color": "#999",
      "font-size": "14px"
    },
    "hr": {
      "margin": "40px auto",
      "border": "0",
      "height": "1px",
      "background-color": "#E3E2E0",
      "width": "100%"
    },
    "a": {
      "color": "#37352F",
      "text-decoration": "none",
      "border-bottom": "1px solid #999",
      "font-weight": "500"
    },
    "strong": {
      "color": "#37352F",
      "font-weight": "600",
      "background-color": "#FDECC8",
      "padding": "2px 4px",
      "margin": "0 2px",
      "border-radius": "3px"
    }
  }
},
{
  "name": "luxury-gold",
  "description": "奢华金：金棕主调、庄重，适合高端/品牌向。",
  "tokens": {
    "primaryColor": "#9E8045",
    "textColor": "#222",
    "fontSize": "16px",
    "lineHeight": 1.6,
    "fontFamily": "\"Songti SC\", \"SimSun\", \"STSong\", \"Georgia\", serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "margin": "70px 0 50px",
      "text-align": "center"
    },
    "h2": {
      "margin": "50px 0 30px",
      "text-align": "center"
    },
    "h3": {
      "margin": "40px 0 20px",
      "text-align": "center"
    },
    "p": {
      "margin": "30px 0",
      "line-height": "2.0",
      "text-align": "justify",
      "color": "#444",
      "font-size": "16px"
    },
    "blockquote": {
      "border-left": "4px solid {{primaryColor}}",
      "background-color": "#f5f9ff",
      "color": "#3a4a5a",
      "padding": "12px 16px",
      "margin": "0 0 {{spacing.block}}",
      "border-radius": "4px"
    },
    "ul": {
      "list-style": "square",
      "padding-left": "20px",
      "margin": "20px 0",
      "color": "#9E8045"
    },
    "ol": {
      "list-style": "decimal",
      "padding-left": "20px",
      "margin": "20px 0",
      "color": "#9E8045"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "color": "#9E8045",
      "background": "#fcfcfc",
      "border": "1px solid #eee",
      "padding": "20px",
      "margin": "0 4px",
      "border-radius": "2px",
      "font-size": "13px",
      "font-family": "serif",
      "display": "block",
      "line-height": "1.6",
      "overflow-x": "auto",
      "white-space": "pre",
      "min-width": "max-content"
    },
    "pre": {
      "background-color": "#f0f4ff",
      "padding": "16px",
      "border-radius": "6px",
      "overflow-x": "auto",
      "font-size": "0.88em",
      "line-height": "1.6",
      "font-family": "Menlo, Consolas, \"Courier New\", monospace",
      "color": "#3b5b9a",
      "margin": "0 0 {{spacing.block}}"
    },
    "img": {
      "display": "block",
      "margin": "50px auto",
      "width": "100%"
    },
    "figcaption": {
      "color": "#999",
      "font-size": "12px",
      "margin-top": "15px",
      "text-align": "center",
      "font-style": "italic",
      "font-family": "serif"
    },
    "hr": {
      "margin": "60px auto",
      "height": "1px",
      "background": "#9E8045",
      "width": "40px",
      "border": "none"
    },
    "a": {
      "color": "#000",
      "border-bottom": "1px solid #9E8045",
      "text-decoration": "none"
    },
    "strong": {
      "color": "#9E8045",
      "font-weight": "bold",
      "margin": "0 2px"
    }
  }
},
{
  "name": "morandi-forest",
  "description": "莫兰迪森林：低饱和绿，安宁舒缓。",
  "tokens": {
    "primaryColor": "#4F6F52",
    "textColor": "#2F3E32",
    "fontSize": "16px",
    "lineHeight": 1.6,
    "fontFamily": "\"Optima\", \"Georgia\", \"PingFang SC\", \"Microsoft YaHei\", serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "margin-top": "60px",
      "margin-bottom": "50px",
      "text-align": "center"
    },
    "h2": {
      "margin-top": "50px",
      "margin-bottom": "24px",
      "text-align": "left",
      "border-bottom": "1px solid #E8EBE9",
      "padding-bottom": "10px"
    },
    "h3": {
      "margin-top": "40px",
      "margin-bottom": "20px",
      "text-align": "center"
    },
    "p": {
      "margin-top": "26px",
      "margin-bottom": "26px",
      "line-height": "2.0",
      "letter-spacing": "0.5px",
      "text-align": "justify",
      "color": "#3A4D39",
      "font-size": "16px"
    },
    "blockquote": {
      "border-left": "4px solid {{primaryColor}}",
      "background-color": "#f5f9ff",
      "color": "#3a4a5a",
      "padding": "12px 16px",
      "margin": "0 0 {{spacing.block}}",
      "border-radius": "4px"
    },
    "ul": {
      "list-style-type": "disc",
      "padding-left": "20px",
      "margin": "20px 0",
      "color": "#86A789"
    },
    "ol": {
      "list-style-type": "decimal",
      "padding-left": "20px",
      "margin": "20px 0",
      "color": "#4F6F52",
      "font-weight": "bold"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "color": "#4F6F52",
      "background": "#F0F2F0",
      "border": "1px solid #DCE3DD",
      "padding": "20px",
      "margin": "0 4px",
      "border-radius": "6px",
      "font-size": "13px",
      "font-family": "sans-serif",
      "display": "block",
      "line-height": "1.6",
      "overflow-x": "auto",
      "white-space": "pre",
      "min-width": "max-content"
    },
    "pre": {
      "background-color": "#f0f4ff",
      "padding": "16px",
      "border-radius": "6px",
      "overflow-x": "auto",
      "font-size": "0.88em",
      "line-height": "1.6",
      "font-family": "Menlo, Consolas, \"Courier New\", monospace",
      "color": "#3b5b9a",
      "margin": "0 0 {{spacing.block}}"
    },
    "img": {
      "display": "block",
      "margin": "40px auto",
      "width": "100%",
      "border-radius": "2px",
      "padding": "6px",
      "background": "#fff",
      "border": "1px solid #eee"
    },
    "figcaption": {
      "font-size": "13px",
      "color": "#889E8B",
      "margin-top": "10px",
      "font-family": "serif"
    },
    "hr": {
      "margin": "60px auto",
      "border": "0",
      "height": "1px",
      "background-color": "#D2D4D4",
      "width": "60%"
    },
    "a": {
      "color": "#4F6F52",
      "text-decoration": "none",
      "border-bottom": "1px solid #4F6F52",
      "font-weight": "600",
      "padding-bottom": "0px"
    },
    "strong": {
      "color": "#1A261D",
      "font-weight": "700",
      "background": "linear-gradient(to top, rgba(134, 167, 137, 0.4) 50%, transparent 50%)",
      "margin": "0 2px",
      "padding": "0 2px"
    }
  }
},
{
  "name": "modern-editorial",
  "description": "现代杂志：杂志式排版、衬线标题，适合深度长文。",
  "tokens": {
    "primaryColor": "#9f4828",
    "textColor": "#34362f",
    "fontSize": "16px",
    "lineHeight": 1.86,
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"PingFang SC\", \"Microsoft YaHei\", \"Noto Sans CJK SC\", sans-serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "padding": "24px 0 20px",
      "text-align": "left",
      "margin": "26px 0 50px",
      "border-top": "5px solid #20221e",
      "border-bottom": "3px solid #c76237",
      "background": "transparent"
    },
    "h2": {
      "padding": "0",
      "text-align": "left",
      "display": "flex",
      "gap": "14px",
      "margin": "56px 0 25px",
      "padding-bottom": "12px",
      "border-bottom": "1px solid #afb1a6"
    },
    "h3": {
      "padding": "0",
      "text-align": "left",
      "margin": "38px 0 19px"
    },
    "p": {
      "margin": "0 0 23px",
      "color": "#34362f",
      "font-size": "16px",
      "line-height": "1.86",
      "letter-spacing": "0.018em",
      "text-align": "justify"
    },
    "blockquote": {
      "border": "none"
    },
    "ul": {
      "margin": "22px 0 28px",
      "padding-left": "24px",
      "color": "#c76237",
      "list-style-type": "square"
    },
    "ol": {
      "margin": "22px 0 28px",
      "padding-left": "24px",
      "color": "#c76237",
      "list-style-type": "decimal-leading-zero"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "margin": "0 2px",
      "padding": "20px 21px",
      "border": "1px solid #d2d1c7",
      "border-radius": "0",
      "color": "#e8e6dd",
      "background": "#23251f",
      "font-family": "\"SFMono-Regular\", Consolas, \"Liberation Mono\", Menlo, monospace",
      "font-size": "13px",
      "word-break": "break-all",
      "display": "block",
      "min-width": "max-content",
      "line-height": "1.72",
      "white-space": "pre"
    },
    "pre": {
      "margin": "32px 0",
      "border-top": "5px solid #c76237",
      "border-radius": "1px",
      "background": "#23251f",
      "overflow-x": "auto"
    },
    "img": {
      "display": "block",
      "max-width": "100%",
      "height": "auto",
      "margin": "0 auto",
      "padding": "7px",
      "border": "1px solid #ccccc2",
      "border-radius": "1px",
      "background": "#f7f6f0"
    },
    "figcaption": {
      "margin-top": "16px",
      "padding-left": "13px",
      "border-left": "3px solid #c76237",
      "color": "#73766b",
      "font-size": "12px",
      "line-height": "1.65",
      "letter-spacing": "0.04em",
      "text-align": "left"
    },
    "hr": {
      "width": "84px",
      "height": "5px",
      "margin": "54px auto",
      "border": "none",
      "background": "#c76237"
    },
    "a": {
      "color": "#9f4828",
      "font-weight": "600",
      "text-decoration": "none",
      "border-bottom": "1px solid #d59a7f"
    },
    "strong": {
      "color": "#242720",
      "font-weight": "700",
      "border-bottom": "2px solid #dfa187"
    }
  }
},
{
  "name": "neo-brutalism",
  "description": "新粗野主义：强边框、高对比色块，大胆爽利。",
  "tokens": {
    "primaryColor": "#CCFF00",
    "textColor": "#000",
    "fontSize": "16px",
    "lineHeight": 1.6,
    "fontFamily": "-apple-system, \"Helvetica Neue\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "margin-top": "60px",
      "margin-bottom": "50px",
      "text-align": "center"
    },
    "h2": {
      "margin-top": "60px",
      "margin-bottom": "30px",
      "text-align": "left",
      "border-bottom": "3px solid #000",
      "padding-bottom": "10px"
    },
    "h3": {
      "margin-top": "40px",
      "margin-bottom": "20px"
    },
    "p": {
      "margin-top": "24px",
      "margin-bottom": "24px",
      "line-height": "1.8",
      "letter-spacing": "0.5px",
      "text-align": "justify",
      "color": "#111",
      "font-size": "16px",
      "font-weight": "400"
    },
    "blockquote": {
      "border-left": "4px solid {{primaryColor}}",
      "background-color": "#f5f9ff",
      "color": "#3a4a5a",
      "padding": "12px 16px",
      "margin": "0 0 {{spacing.block}}",
      "border-radius": "4px"
    },
    "ul": {
      "list-style-type": "square",
      "padding-left": "20px",
      "margin": "20px 0",
      "color": "#6A00FF"
    },
    "ol": {
      "list-style-type": "decimal",
      "padding-left": "20px",
      "margin": "20px 0",
      "color": "#000",
      "font-weight": "900"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "color": "#CCFF00",
      "background": "#000",
      "border": "2px solid #000",
      "padding": "16px",
      "margin": "0 4px",
      "font-size": "13px",
      "font-family": "\"Menlo\", \"Courier New\", monospace",
      "font-weight": "bold",
      "display": "block",
      "line-height": "1.5",
      "border-radius": "0",
      "overflow-x": "auto",
      "white-space": "pre",
      "min-width": "max-content"
    },
    "pre": {
      "background-color": "#f0f4ff",
      "padding": "16px",
      "border-radius": "6px",
      "overflow-x": "auto",
      "font-size": "0.88em",
      "line-height": "1.6",
      "font-family": "Menlo, Consolas, \"Courier New\", monospace",
      "color": "#3b5b9a",
      "margin": "0 0 {{spacing.block}}"
    },
    "img": {
      "display": "block",
      "margin": "40px auto",
      "width": "100%",
      "border": "2px solid #000",
      "padding": "0",
      "background": "#fff"
    },
    "figcaption": {
      "margin-top": "12px",
      "text-align": "center",
      "color": "#000",
      "font-size": "14px",
      "font-weight": "bold",
      "background": "#CCFF00",
      "padding": "4px 10px",
      "border": "2px solid #000",
      "display": "inline-block"
    },
    "hr": {
      "margin": "60px auto",
      "border": "0",
      "height": "4px",
      "background": "#000",
      "width": "100%"
    },
    "a": {
      "color": "#000",
      "text-decoration": "none",
      "border-bottom": "2px solid #000",
      "background": "linear-gradient(180deg, transparent 60%, #CCFF00 0)",
      "font-weight": "700",
      "padding": "0 2px"
    },
    "strong": {
      "color": "#fff",
      "background-color": "#6A00FF",
      "font-weight": "700",
      "padding": "2px 6px",
      "margin": "0 2px",
      "border": "1px solid #000"
    }
  }
},
{
  "name": "receipt",
  "description": "收据风：点线边框、等宽感，适合清单与记录。",
  "tokens": {
    "primaryColor": "#000",
    "textColor": "#111",
    "fontSize": "16px",
    "lineHeight": 1.6,
    "fontFamily": "\"Courier New\", \"SimSun\", \"Songti SC\", monospace",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "margin": "40px 0 30px",
      "text-align": "center",
      "border-top": "2px dashed #000",
      "border-bottom": "2px dashed #000",
      "padding": "15px 0"
    },
    "h2": {
      "margin": "30px 0 20px",
      "text-align": "center"
    },
    "h3": {
      "margin": "25px 0 10px"
    },
    "p": {
      "margin": "18px 0",
      "line-height": "1.6",
      "text-align": "justify",
      "color": "#222",
      "font-size": "15px"
    },
    "blockquote": {
      "border-left": "4px solid {{primaryColor}}",
      "background-color": "#f5f9ff",
      "color": "#3a4a5a",
      "padding": "12px 16px",
      "margin": "0 0 {{spacing.block}}",
      "border-radius": "4px"
    },
    "ul": {
      "list-style": "none",
      "padding-left": "10px",
      "margin": "20px 0"
    },
    "ol": {
      "list-style": "decimal",
      "padding-left": "25px",
      "margin": "20px 0",
      "font-weight": "bold"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "color": "#fff",
      "font-family": "\"Courier New\", monospace",
      "padding": "15px",
      "margin": "0 4px",
      "font-size": "13px",
      "line-height": "1.5"
    },
    "pre": {
      "background-color": "#f0f4ff",
      "padding": "16px",
      "border-radius": "6px",
      "overflow-x": "auto",
      "font-size": "0.88em",
      "line-height": "1.6",
      "font-family": "Menlo, Consolas, \"Courier New\", monospace",
      "color": "#3b5b9a",
      "margin": "0 0 {{spacing.block}}"
    },
    "img": {
      "display": "block",
      "margin": "30px auto",
      "width": "100%",
      "border": "2px dashed #000",
      "padding": "8px",
      "background": "#fff"
    },
    "figcaption": {
      "margin-top": "8px",
      "text-align": "center",
      "color": "#000",
      "font-size": "13px",
      "font-family": "monospace",
      "border-top": "1px dashed #000",
      "padding-top": "6px"
    },
    "hr": {
      "margin": "30px 0",
      "border": "none",
      "border-top": "2px dashed #000"
    },
    "a": {
      "color": "#000",
      "text-decoration": "underline",
      "font-weight": "bold"
    },
    "strong": {
      "font-weight": "900",
      "background": "#ddd",
      "padding": "0 4px"
    }
  }
},
{
  "name": "sunset-film",
  "description": "日落胶片：暖橙胶片感，适合故事与生活。",
  "tokens": {
    "primaryColor": "#B33D25",
    "textColor": "#4A3B32",
    "fontSize": "16px",
    "lineHeight": 1.6,
    "fontFamily": "\"Songti SC\", \"SimSun\", \"STSong\", \"Georgia\", serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "margin-top": "60px",
      "margin-bottom": "50px",
      "text-align": "center",
      "border-top": "4px double #B33D25",
      "border-bottom": "1px solid #B33D25",
      "padding": "20px 0"
    },
    "h2": {
      "margin-top": "50px",
      "margin-bottom": "30px",
      "text-align": "left"
    },
    "h3": {
      "margin-top": "40px",
      "margin-bottom": "20px"
    },
    "p": {
      "margin-top": "26px",
      "margin-bottom": "26px",
      "line-height": "1.9",
      "letter-spacing": "0.8px",
      "text-align": "justify",
      "color": "#5D4037",
      "font-size": "16px"
    },
    "blockquote": {
      "border-left": "4px solid {{primaryColor}}",
      "background-color": "#f5f9ff",
      "color": "#3a4a5a",
      "padding": "12px 16px",
      "margin": "0 0 {{spacing.block}}",
      "border-radius": "4px"
    },
    "ul": {
      "list-style-type": "square",
      "padding-left": "20px",
      "margin": "20px 0",
      "color": "#D98C45"
    },
    "ol": {
      "list-style-type": "decimal",
      "padding-left": "20px",
      "margin": "20px 0",
      "color": "#B33D25",
      "font-weight": "bold",
      "font-family": "serif"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "color": "#E6CBB5",
      "background": "#4A3B32",
      "border": "4px solid #F7EED6",
      "padding": "20px",
      "margin": "0 4px",
      "border-radius": "4px",
      "font-size": "13px",
      "font-family": "\"Courier New\", Courier, monospace",
      "display": "block",
      "line-height": "1.6",
      "overflow-x": "auto",
      "white-space": "pre",
      "min-width": "max-content"
    },
    "pre": {
      "background-color": "#f0f4ff",
      "padding": "16px",
      "border-radius": "6px",
      "overflow-x": "auto",
      "font-size": "0.88em",
      "line-height": "1.6",
      "font-family": "Menlo, Consolas, \"Courier New\", monospace",
      "color": "#3b5b9a",
      "margin": "0 0 {{spacing.block}}"
    },
    "img": {
      "display": "block",
      "margin": "40px auto",
      "width": "95%",
      "border": "8px solid #fff",
      "background": "#fff"
    },
    "figcaption": {
      "font-size": "13px",
      "color": "#8D5B4C",
      "margin-top": "15px",
      "font-style": "italic",
      "font-family": "serif"
    },
    "hr": {
      "margin": "60px auto",
      "border": "0",
      "height": "1px",
      "border-top": "2px dashed #D98C45",
      "width": "100%"
    },
    "a": {
      "color": "#B33D25",
      "text-decoration": "none",
      "border-bottom": "1px solid #B33D25",
      "font-weight": "bold"
    },
    "strong": {
      "color": "#B33D25",
      "font-weight": "900",
      "margin": "0 2px"
    }
  }
},
{
  "name": "template",
  "description": "主题模板：WeMD 官方模板基线，通用可调。",
  "tokens": {
    "primaryColor": "#1e6bb8",
    "textColor": "#333",
    "fontSize": "16px",
    "lineHeight": 1.6,
    "fontFamily": "-apple-system, BlinkMacSystemFont, \"Microsoft YaHei\", sans-serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "margin": "40px 0 30px",
      "text-align": "center"
    },
    "h2": {
      "margin": "30px 0 20px"
    },
    "h3": {
      "margin": "25px 0 15px"
    },
    "p": {
      "margin": "16px 0",
      "line-height": "1.7",
      "text-align": "justify",
      "color": "#333",
      "font-size": "16px"
    },
    "blockquote": {
      "border-left": "4px solid {{primaryColor}}",
      "background-color": "#f5f9ff",
      "color": "#3a4a5a",
      "padding": "12px 16px",
      "margin": "0 0 {{spacing.block}}",
      "border-radius": "4px"
    },
    "ul": {
      "margin": "15px 0",
      "padding-left": "25px",
      "list-style-type": "disc"
    },
    "ol": {
      "margin": "15px 0",
      "padding-left": "25px",
      "list-style-type": "decimal"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "color": "#e83e8c",
      "background": "#f5f5f5",
      "padding": "16px",
      "margin": "0 2px",
      "border-radius": "4px",
      "font-size": "13px",
      "font-family": "\"Courier New\", \"Consolas\", \"Monaco\", monospace",
      "display": "block",
      "line-height": "1.6",
      "overflow-x": "auto",
      "white-space": "pre",
      "min-width": "max-content",
      "border": "1px solid #ddd"
    },
    "pre": {
      "background-color": "#f0f4ff",
      "padding": "16px",
      "border-radius": "6px",
      "overflow-x": "auto",
      "font-size": "0.88em",
      "line-height": "1.6",
      "font-family": "Menlo, Consolas, \"Courier New\", monospace",
      "color": "#3b5b9a",
      "margin": "0 0 {{spacing.block}}"
    },
    "img": {
      "display": "block",
      "margin": "20px auto",
      "max-width": "100%",
      "border-radius": "4px"
    },
    "figcaption": {
      "margin-top": "8px",
      "color": "#999",
      "font-size": "14px"
    },
    "hr": {
      "margin": "30px 0",
      "border": "none",
      "border-top": "1px solid #ddd",
      "height": "1px"
    },
    "a": {
      "color": "#1e6bb8",
      "text-decoration": "none",
      "border-bottom": "1px solid #1e6bb8",
      "font-weight": "bold"
    },
    "strong": {
      "font-weight": "bold",
      "color": "#000"
    }
  }
},
{
  "name": "whitespace-gallery",
  "description": "留白画廊：大量留白、极简，适合艺术与展示。",
  "tokens": {
    "primaryColor": "#80503f",
    "textColor": "#3a3734",
    "fontSize": "17px",
    "lineHeight": 2,
    "fontFamily": "\"Songti SC\", \"STSong\", \"Noto Serif CJK SC\", SimSun, serif",
    "spacing": {
      "block": "16px"
    }
  },
  "blocks": {
    "h1": {
      "max-width": "12em",
      "margin": "58px auto 96px",
      "padding": "0",
      "border": "none",
      "text-align": "center"
    },
    "h2": {
      "max-width": "22em",
      "margin": "78px auto 34px",
      "text-align": "left"
    },
    "h3": {
      "max-width": "34em",
      "margin": "44px auto 20px",
      "padding": "0",
      "border": "none"
    },
    "p": {
      "max-width": "34em",
      "margin": "0 auto 31px",
      "color": "#3a3734",
      "font-size": "17px",
      "line-height": "2",
      "text-align": "left"
    },
    "blockquote": {
      "border": "none"
    },
    "ul": {
      "max-width": "38em",
      "margin": "24px auto 31px",
      "padding-left": "25px",
      "color": "#8b4c3b"
    },
    "ol": {
      "max-width": "38em",
      "margin": "24px auto 31px",
      "padding-left": "25px",
      "color": "#8b4c3b"
    },
    "li": {
      "line-height": "{{lineHeight}}",
      "margin": "0 0 6px"
    },
    "code": {
      "padding": "21px",
      "border-bottom": "1px solid #a7a29d",
      "color": "#f0efed",
      "background": "#2b2927",
      "font-family": "\"SFMono-Regular\", Consolas, monospace",
      "font-size": "13px",
      "display": "block",
      "min-width": "max-content",
      "line-height": "1.72",
      "white-space": "pre"
    },
    "pre": {
      "margin": "38px 0",
      "border": "1px solid #2b2927",
      "background": "#2b2927",
      "overflow-x": "auto"
    },
    "img": {
      "display": "block",
      "max-width": "100%",
      "height": "auto",
      "margin": "0 auto"
    },
    "figcaption": {
      "max-width": "34em",
      "margin": "16px auto 0",
      "padding-top": "9px",
      "border-top": "1px solid #bbb6b1",
      "color": "#77706a",
      "font-size": "12px",
      "line-height": "1.7",
      "letter-spacing": "0.055em",
      "text-align": "left"
    },
    "hr": {
      "width": "1px",
      "height": "64px",
      "margin": "72px auto",
      "border": "none",
      "background": "#2b2927"
    },
    "a": {
      "color": "#80503f",
      "font-weight": "600",
      "text-decoration": "underline"
    },
    "strong": {
      "color": "#2b2927",
      "font-weight": "750"
    }
  }
}
]
