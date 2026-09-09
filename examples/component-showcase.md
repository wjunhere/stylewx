::::canvas{tone="paper" padding="18px 16px"}

:::cover{title="把公众号排版做成一门手艺" subtitle="WRITE & DESIGN" author="stylewx" date="2025 · 09" image="https://picsum.photos/seed/stylewx-cover/900/600"}
:::

:::pulse{text="全文约 1800 字，阅读需要 6 分钟"}
:::

:::toc{title="本文目录" max-level="2"}
:::

## 一、排版不是装饰

很多人把排版理解成"给文字加颜色"。真正做过长文的人会知道，排版解决的是另一个问题：**在读者失去耐心之前，让他抓住重点。**

一篇文章的失败往往不是内容不好，而是读者在第三段就放弃了。字号、行距、留白、层级，这些看起来琐碎的变量，决定了读者能不能顺利读完。

:::callout{type="tip" title="一句话结论"}
好的排版不是让页面变花，而是让信息层级一眼可见。
:::

:::image{src="https://picsum.photos/seed/stylewx-desk/900/600" caption="一张有呼吸感的配图，比十行加粗更有说服力" shadow="true"}
:::

## 二、四个真正影响阅读的变量

排版里能改的东西很多，但真正影响阅读体验的只有四个：**字号、行距、层级、留白**。其余的都是在为这四件事服务。

:::compare{layout="stack" left-tone="neutral" right-tone="primary"}
| 只做加粗 | 建立层级 |
| --- | --- |
| 全篇一个字号 | 标题 / 正文 / 图注分级 |
| 段落连成一片 | 用间距和留白分组 |
| 图片直接裸贴 | 图注、圆角、网格 |
| 重点全靠感叹号 | 用色块、标签、卡片 |
:::

:::card{title="三个可复用的原则" icon="📌"}
- **一致性**：全局字号、行距、配色统一，读者不需要重新适应
- **克制**：装饰元素宁缺毋滥，每个都要有存在的理由
- **可读**：正文 15~16px，行距 1.7 以上，段间距大于行距
:::

### 2.1 时间线让过程一目了然

讲演进、讲复盘的时候，最容易写成流水账。时间线能把"先后关系"直接画出来。

:::timeline{title="我们踩过的坑"}
- 2023 | 只会用 Markdown 加粗，读者找不到重点
- 2024 | 引入主题系统，但组件仍然是纯文本
- 2025 | 组件库上线，图片、卡片、交互都能复用
:::

:::steps{layout="vertical" tone="primary"}
1. 先定层级 | 想清楚哪三句话最重要
2. 再调变量 | 字号、行距、间距，一次只改一个
3. 最后加组件 | 用卡片、图注、分割线做收口
:::

## 三、让文章动起来

静态排版已经能解决大部分问题。但如果内容本身有"过程感"——进度、对比、答案——适度的动效会让读者停留更久。

:::progress{value="72" label="组件库完成度"}
:::

:::reveal{label="点击查看：为什么不用 JavaScript？" tone="primary"}
微信公众号正文会过滤 script 标签。真正能在读者端生效的交互，只有内联 SVG 加 SMIL 动画——它是声明式的，不需要脚本，微信草稿接口会完整保留。
:::

:::carousel{height="200" interval="3" caption="自动轮播：三张图依次淡入淡出"}
![清晨的桌面](https://picsum.photos/seed/stylewx-c1/900/600)
![阅读中的手稿](https://picsum.photos/seed/stylewx-c2/900/600)
![排版后的页面](https://picsum.photos/seed/stylewx-c3/900/600)
:::

:::gallery{cols="3" caption="多图网格：适合展示一组对比图"}
![左](https://picsum.photos/seed/stylewx-g1/600/600)
![中](https://picsum.photos/seed/stylewx-g2/600/600)
![右](https://picsum.photos/seed/stylewx-g3/600/600)
:::

:::draw{shape="underline" tone="primary" text="重点句可以这样被画出来"}
:::

:::badge{text="新功能" tone="success"}
:::

:::badge{text="SVG 交互" tone="primary"}
:::

:::badge{text="组件库" tone="info" outline="true"}
:::

:::divider{style="wave" tone="primary"}
:::

## 四、收尾

:::quote{author="某位编辑" source="《排版笔记》"}
读者不会记得你用了什么字体，但会记得读起来累不累。
:::

:::end-card{title="感谢阅读" footer="stylewx · 让排版自动化"}
如果这篇对你有帮助，欢迎转发给需要的人。
:::

::::
