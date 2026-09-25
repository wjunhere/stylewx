"""重建 Hippie 青年 品牌档案（颜色全部采样自公众号真实头像）。

跑法：node -e "..." 太容易在引号上翻车，所以写成 .py 文件再执行。
"""
import json
import os

SX = os.path.join(os.environ['USERPROFILE'], '.stylewx')
ROOT = r'B:\wechat_editer'

theme = {
    "name": "hippie-youth",
    "description": "Hippie 青年主题：夜蓝为底、路灯暖橘点睛，衬线标题的文艺夜读气质",
    "tokens": {
        "primaryColor": "#0A2A6B",   # 采样：头像渐层夜空顶部
        "textColor": "#16202E",      # 夜蓝压成近黑，比纯黑透气
        "fontSize": "15px",
        "lineHeight": 1.9,
        "fontFamily": "Georgia, 'Times New Roman', 'Songti SC', serif",
        "spacing": {"block": "20px"},
        "accentColor": "#F5A623",    # 采样：头像灯泡最暖处 #feb900 收一档
        "mutedColor": "#5C6675",
        "cardBg": "#F2F0EA",
        "cardBorderColor": "#E2E5EA",
        "dividerColor": "#D7DDE7",
        "canvasBg": "#FBF9F4",
        "radius": "8px",
    },
    "blocks": {
        "h1": {"color": "{{primaryColor}}", "font-size": "30px", "font-weight": "700",
               "line-height": "1.36", "margin": "0 0 {{spacing.block}}", "letter-spacing": "0.01em"},
        "h2": {"color": "{{primaryColor}}", "font-size": "23px", "font-weight": "700",
               "line-height": "1.45", "margin": "30px 0 18px",
               "border-left": "4px solid {{accentColor}}", "padding-left": "12px"},
        "h3": {"color": "{{primaryColor}}", "font-size": "18px", "font-weight": "700",
               "line-height": "1.45", "margin": "0 0 {{spacing.block}}"},
        "p": {"color": "{{textColor}}", "font-size": "{{fontSize}}",
              "line-height": "{{lineHeight}}", "margin": "0 0 {{spacing.block}}"},
        "blockquote": {"border-left": "3px solid {{accentColor}}", "background-color": "{{cardBg}}",
                       "color": "#4B5563", "padding": "14px 18px",
                       "margin": "0 0 {{spacing.block}}", "border-radius": "6px", "font-style": "italic"},
        "ul": {"padding-left": "1.35em", "margin": "0 0 {{spacing.block}}", "list-style": "disc"},
        "ol": {"padding-left": "1.35em", "margin": "0 0 {{spacing.block}}"},
        "li": {"line-height": "{{lineHeight}}", "margin": "0 0 7px"},
        "code": {"font-family": "Menlo, Consolas, 'Courier New', monospace", "font-size": "0.9em",
                 "background-color": "#EFEFF2", "color": "#16202E", "padding": "2px 5px",
                 "border-radius": "4px"},
        "pre": {"background-color": "#F4F5F7", "padding": "16px", "border-radius": "6px",
                "overflow-x": "auto", "font-size": "0.88em", "line-height": "1.65",
                "font-family": "Menlo, Consolas, 'Courier New', monospace", "color": "#16202E",
                "margin": "0 0 {{spacing.block}}"},
        "img": {"max-width": "100%", "height": "auto", "display": "block", "border-radius": "6px",
                "margin": "0 auto {{spacing.block}}"},
        "figcaption": {"font-size": "0.85em", "color": "#8A93A0", "text-align": "center",
                       "margin-top": "8px"},
        "hr": {"border": "none", "border-top": "1px solid {{dividerColor}}", "margin": "28px 0"},
        "a": {"color": "{{primaryColor}}", "text-decoration": "none",
              "border-bottom": "1px solid {{primaryColor}}"},
        "strong": {"color": "{{primaryColor}}", "font-weight": "700"},
    },
}

# ── 组件：三套头/尾图 + 信封插图 ─────────────────────────────────────────
comps = []
for plan in json.load(open(os.path.join(ROOT, 'assets-src/motion/components.json'), encoding='utf-8')):
    comps.extend(plan['components'])
comps.extend(json.load(open(os.path.join(ROOT, 'assets-src/motion/extras.json'), encoding='utf-8')))
comps = [{"name": c['name'], "description": c['description'], "template": c['template'],
          "defaults": c.get('defaults', {}), "slots": []} for c in comps]

# 1) 全局组件库（渲染时按名字解析 :::hip-xxx）
libf = os.path.join(SX, 'components.json')
lib = json.load(open(libf, encoding='utf-8'))
items = lib if isinstance(lib, list) else lib['components']
names = {c['name'] for c in comps}
items = [c for c in items if c['name'] not in names]
items.extend(comps)
json.dump(items if isinstance(lib, list) else {**lib, 'components': items},
          open(libf, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('组件库 ->', [c['name'] for c in items])

profile = {
    "name": "hippie-youth",
    "displayName": "Hippie 青年",
    "description": "文艺向青年随笔与教育观察号，气质：夜读、清醒、不喧哗；受众是在读学生与刚毕业的年轻人。",
    "rationale": "主色与点睛色全部采样自公众号真实头像：夜蓝 #0A2A6B 取自渐层夜空顶部，暖橘 #F5A623 取自那盏路灯灯泡的最暖处 #feb900（收一档避免过曝）。两者正是头像里最核心的一组关系——冷夜与一盏灯。文案锚点取自账号签名「前已无通路，后不见归途。」动效也只从这个意象推导：线描生长、灯光点亮、剪影走入画面，不做与「夜与灯」无关的装饰。",
    "theme": theme,
    "components": comps,
    "voice": [
        "标题短、留白多，宁可少说一句",
        "用具体的场景和数字说话，不用「赋能」「闭环」这类词",
        "结句可以用与签名呼应的一句收束，但不要每节都煽情",
        "落款统一「HIPPIE 青年」，不写讨要关注的话术",
    ],
    "taboos": [
        "不要高饱和撞色与荧光色（暖橘是唯一的有彩色）",
        "不要可爱化、卡通化的装饰（与克制语气冲突）",
        "正文不要居中",
        "不要「点击蓝字关注」式的催促",
    ],
    "logo": None,
    "coverImage": None,
    "headerComponent": "hip-head-a",
    "learnings": [
        {"date": "2026-09-25", "note": "动效资产落定三套：A「归途」线描生长 / B「灯下」光圈点亮 / C「行囊」暮色剪影。全部为内联 SVG + SMIL（微信唯一真能动且实测存活的通道）。源文件 assets-src/motion/，生成器 assets-src/gen-motion.mjs。"},
        {"date": "2026-09-25", "note": "踩坑一：缩放元素时不能把绝对坐标乘 s，必须用 transform 先搬原点再 scale，否则灯头与灯柱脱开（越放大偏得越厉害）。"},
        {"date": "2026-09-25", "note": "踩坑二：父级 <g> 挂了 <animateTransform transform> 时，子树里的静态 transform 会让整棵子树消失 —— 不是动画失效，是图形整个不见。剪影坐标要烘成绝对值。"},
        {"date": "2026-09-25", "note": "踩坑三：深色底上「大面积 + 低透明」的暖色会调出脏灰（实测变芥末灰）。要么缩小面积并提高不透明度，要么直接用实心色块 / 纯色描边。"},
        {"date": "2026-09-25", "note": "logo 与头图的分工：logo 是标志（实心、高对比、48px 仍可辨认，不含光晕与渐变）；头图是版面（可以有光晕、呼吸与长入场）。早先把整幅插画塞进 logo，缩小后糊成一团。"},
        {"date": "2026-09-25", "note": "微信封面只接受位图，动效拍不进去；封面给与头图同源的静帧版式（940×400，2.35:1）作为呼应。"},
    ],
    "assets": {
        "motionSource": "assets-src/motion/",
        "generator": "assets-src/gen-motion.mjs",
        "plans": [
            {"key": "A · 归途", "syntax": "地平线与灯柱描边生长，灯亮后呼吸；最安静", "components": ["hip-head-a", "hip-end-a"]},
            {"key": "B · 灯下", "syntax": "光圈层层推开，字被照亮；适合读书/思考类", "components": ["hip-head-b", "hip-end-b"]},
            {"key": "C · 行囊", "syntax": "暮色三层压下 + 剪影走入画面；叙事最强", "components": ["hip-head-c", "hip-end-c"]},
        ],
        "logo": "assets-src/motion/logo-a.png（另有 logo-b.png / logo-c.png 备选）",
        "cover": "assets-src/motion/cover.png（940×400）",
        "illustration": "hip-letter（信封线稿插图）",
    },
    "updatedAt": "2026-09-25T00:00:00.000Z",
}

d = os.path.join(SX, 'brands', 'hippie-youth')
os.makedirs(d, exist_ok=True)

# 保留已经上传到微信素材库的 logo / 封面直链，别被重跑清掉
prev = os.path.join(d, 'profile.json')
if os.path.exists(prev):
    old = json.load(open(prev, encoding='utf-8'))
    profile['logo'] = old.get('logo')
    profile['coverImage'] = old.get('coverImage')
    # 学习记录是累积的，重跑脚本不该清空
    learned = {l['note'] for l in profile['learnings']}
    profile['learnings'] = profile['learnings'] + [l for l in old.get('learnings', []) if l['note'] not in learned]
json.dump(profile, open(os.path.join(d, 'profile.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('品牌档案 ->', d)
