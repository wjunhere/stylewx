# 主题微调配方

`tweak_theme` 的 `tokens` 是确定性的，秒级返回，不烧 LLM。
下面每个配方都可以直接贴进 `tweak_theme{theme, tokens}`，或先用 `generate_theme` 生成骨架再套。

## 科技极简

```json
{
  "theme": "tech-minimal",
  "tokens": {
    "primaryColor": "#0b6bff",
    "textColor": "#1f2329",
    "fontSize": "15px",
    "lineHeight": 1.75,
    "radius": "10px",
    "cardBg": "#f4f8ff",
    "dividerColor": "#e6ecf5"
  }
}
```

## 杂志文艺

```json
{
  "theme": "magazine",
  "tokens": {
    "primaryColor": "#b4546a",
    "textColor": "#3a3232",
    "fontSize": "16px",
    "lineHeight": 2,
    "radius": "18px",
    "cardBg": "#fdf6f7",
    "dividerColor": "#ece5e5"
  }
}
```

## 商务稳重

```json
{
  "theme": "business",
  "tokens": {
    "primaryColor": "#1f3864",
    "textColor": "#2b2b2b",
    "fontSize": "15.5px",
    "lineHeight": 1.8,
    "radius": "6px",
    "cardBg": "#f5f7fa",
    "dividerColor": "#e2e6ec"
  }
}
```

## 政务红

```json
{
  "theme": "gov-red",
  "tokens": {
    "primaryColor": "#c0272d",
    "textColor": "#222222",
    "fontSize": "16px",
    "lineHeight": 1.85,
    "radius": "4px",
    "cardBg": "#fdf3f3"
  }
}
```

## 深色代码

深色文章要**换主题**而不是给画布套深底——主题会把文字色直接内联到 `p`/`h1` 上，
单独给 `canvas` 设深色背景会变成「深底深字」。

```json
{
  "theme": "dark-code",
  "tokens": {
    "primaryColor": "#3ee0a4",
    "textColor": "#e7e7e7",
    "fontSize": "15px",
    "lineHeight": 1.8,
    "radius": "12px"
  }
}
```

## 用 blocks 做局部定制

`blocks` 覆盖某个元素的微信白名单内 CSS：

```json
{
  "theme": "tech-minimal",
  "blocks": {
    "p": { "font-size": "16px", "text-indent": "2em", "text-align": "justify" },
    "h2": { "border-left": "4px solid #0b6bff", "padding-left": "12px" },
    "blockquote": { "background-color": "#f5f9ff", "border-left": "4px solid #0b6bff" }
  }
}
```

不要写 `position`、`filter`（会被微信过滤，校验器直接报错）。
