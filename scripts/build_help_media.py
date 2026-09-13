"""Build original instructional UI diagrams, not browser screenshots.

Pillow is a development-only dependency. No remote images or fonts are used.
The PNG keyframes and animated GIFs are embedded as data URIs for offline use.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import base64, json, math

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'src/assets/help'
OUT.mkdir(parents=True, exist_ok=True)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
W, H = 960, 540
INK, MUTED, PURPLE, GOLD = '#493852', '#8f8196', '#9477aa', '#9a6129'

def font(size=16, bold=False, mono=False):
    return ImageFont.truetype(MONO if mono else BOLD if bold else FONT, size)

def txt(d, xy, text, size=16, fill=INK, bold=False, anchor=None, mono=False):
    d.text(xy, text, font=font(size,bold,mono), fill=fill, anchor=anchor)

def wrapped(d, xy, text, width, size=16, fill=INK, bold=False, limit=4):
    words=text.split(); lines=[]; line=''
    for word in words:
        trial=(line+' '+word).strip()
        if d.textlength(trial,font=font(size,bold))>width and line:
            lines.append(line);line=word
        else:line=trial
    if line:lines.append(line)
    for i,line in enumerate(lines[:limit]):txt(d,(xy[0],xy[1]+i*(size+7)),line,size,fill,bold)

def rr(d,box,fill='#ffffff',outline='#ded4e5',width=1,r=10):
    d.rounded_rectangle(box,r,fill=fill,outline=outline,width=width)

def path(d,a,b,color='#7b7893',dash=False,width=2,arrow=True,gold=False):
    dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy);ux,uy=dx/length,dy/length
    if gold:
        d.line([a,b],fill='#edd6b5',width=7);d.line([a,b],fill=GOLD,width=3)
        mid=((a[0]+b[0])/2,(a[1]+b[1])/2)
        d.ellipse([mid[0]-5,mid[1]-5,mid[0]+5,mid[1]+5],fill='#fff9e6',outline=GOLD,width=2)
    elif dash:
        for start in range(0,int(length),15):
            end=min(length,start+8);d.line([(a[0]+ux*start,a[1]+uy*start),(a[0]+ux*end,a[1]+uy*end)],fill=color,width=width)
    else:d.line([a,b],fill=color,width=width)
    if arrow:
        d.polygon([b,(b[0]-ux*8-uy*4,b[1]-uy*8+ux*4),(b[0]-ux*8+uy*4,b[1]-uy*8-ux*4)],fill=color)

def base(locale,step,title,caption):
    en=locale=='en';im=Image.new('RGB',(W,H),'#f7f4fb');d=ImageDraw.Draw(im)
    d.rectangle([0,0,W,58],fill='#fffdfb');d.line([(0,58),(W,58)],fill='#e5dce9')
    txt(d,(25,19),'PlyLoom',16,PURPLE,True)
    txt(d,(480,28),title,21,INK,True,anchor='mm')
    txt(d,(930,27),'ENG' if en else 'RU',12,MUTED,True,anchor='rm')
    txt(d,(24,73),'ILLUSTRATED WALKTHROUGH' if en else 'УЧЕБНАЯ ИЛЛЮСТРАЦИЯ',10,MUTED,True)
    txt(d,(935,73),f'{step+1} / 4',11,MUTED,anchor='ra')
    rr(d,[19,467,941,523],fill='#fffaf2',outline='#e4cbaa',r=9)
    rr(d,[32,480,60,508],fill=GOLD,outline=GOLD,r=7);txt(d,(46,494),str(step+1),13,'#fff',True,anchor='mm')
    wrapped(d,(77,478),caption,833,15,INK,False,2)
    return im,d

def node(d,x,y,title,body='',plus=True,selected=False,w=213,expanded=False):
    height=203 if expanded else 84
    rr(d,[x,y,x+w,y+height],outline=GOLD if selected else '#cabdd4',width=2 if selected else 1,r=9)
    d.rectangle([x+1,y+12,x+4,y+height-12],fill=GOLD if selected else PURPLE)
    wrapped(d,(x+13,y+12),title,w-47,14,INK,True,2)
    rr(d,[x+w-32,y+9,x+w-9,y+32],fill='#f7f3fb',outline='#c9b7d6',r=5)
    txt(d,(x+w-20,y+21),'−' if expanded else '+',18,PURPLE,anchor='mm')
    if expanded:
        d.line([(x+10,y+66),(x+w-10,y+66)],fill='#eee6f2')
        txt(d,(x+13,y+77),'Name / Имя',10,MUTED)
        rr(d,[x+11,y+93,x+w-11,y+120],r=4);txt(d,(x+17,y+99),title,11)
        txt(d,(x+13,y+129),'Body / Тело',10,MUTED)
        rr(d,[x+11,y+145,x+w-11,y+191],r=4);wrapped(d,(x+17,y+151),body,w-35,11,INK,False,2)
    elif body:wrapped(d,(x+13,y+53),body,w-24,11,MUTED,False,1)

def sheet(d,box,name,active=False):
    x,y,r,b=box;rr(d,box,fill='#faf8fc',outline='#9681ad' if active else '#e0d8e8',width=2 if active else 1,r=4)
    d.line([(x+1,y+2),(r-1,y+2)],fill='#b59bc7',width=2)
    txt(d,(x+12,y+11),name,12,PURPLE,True)
    d.line([(x,y+37),(r,y+37)],fill='#e4dbe9')

def spread(locale,i):
    en=locale=='en';title='Reading the lines' if en else 'Как читать линии'
    captions=['Gold, no arrow: appearances of the same entity. One ID, shared text and attributes.','Dashed arrow: a relationship to an entity on another sheet.','Thin solid arrow: a relationship inside one sheet.','Hide side references to leave clean sheets. The graph stays intact.'] if en else ['Золото без стрелки — появления одной сущности. Один ID, общие текст и атрибуты.','Пунктирная стрелка — связь с сущностью другого листа.','Тонкая сплошная стрелка — связь внутри одного листа.','Скрываем боковые переходы. Чистые листы; данные карты сохраняются.']
    im,d=base(locale,i,title,captions[i]);show=i<3
    sheet(d,[23,138,448,437],'Sheet: Product' if en else 'Лист: Продукт',i%2==0)
    sheet(d,[449,138,935,437],'Sheet: Money' if en else 'Лист: Деньги',i%2==1)
    rr(d,[681,99,934,130],fill='#f0e8f8' if show else '#fff',outline='#bfa9cf',r=5)
    txt(d,(692,108),('Side references: ON' if show else 'Side references: OFF') if en else ('Боковые переходы: ВКЛ' if show else 'Переходы скрыты'),12,PURPLE)
    nm='Morning blend' if en else 'Смесь «Утро»'
    path(d,(296,231),(522,231),gold=True,arrow=False)
    path(d,(296,233),(522,352),dash=True,width=3 if i==1 else 2)
    path(d,(626,273),(626,312),width=2 if i==2 else 1,color='#788396')
    node(d,81,189,nm,'id: blend',selected=i==0)
    node(d,522,189,nm,'id: blend',selected=i==0)
    node(d,522,312,'Batch cost' if en else 'Себестоимость','id: cost')
    if show:
        path(d,(770,281),(770,430),dash=True,width=1,arrow=False)
        rr(d,[788,307,921,392],fill='#f2eef6',outline='#ded5e6',r=6)
        txt(d,(798,316),'↗ Suppliers' if en else '↗ Поставщики',10,MUTED)
        wrapped(d,(798,340),'Green coffee' if en else 'Зелёное зерно',113,12,MUTED,True)
        path(d,(735,352),(787,352),dash=True)
    return im

def editing(locale,i):
    en=locale=='en';nm='Morning blend' if en else 'Смесь «Утро»'
    captions=['Press + to open the node editor.','Name and body are editable inside the card.','Edit one appearance: the same body updates on the other sheet.','Collapse with −. Undo can restore the previous content.'] if en else ['Нажмите «+», чтобы раскрыть редактор узла.','Название и тело редактируются прямо в карточке.','Правка одного появления обновляет общее тело на другом листе.','Сверните карточку через «−». Правку можно отменить.']
    im,d=base(locale,i,'One node, two appearances' if en else 'Один узел, два появления',captions[i])
    sheet(d,[24,110,466,440],'Sheet: Product' if en else 'Лист: Продукт',True);sheet(d,[468,110,936,440],'Sheet: Money' if en else 'Лист: Деньги')
    expanded=i in [1,2];body=('Recipe confirmed' if en else 'Рецепт подтверждён') if i>=2 else ('Draft recipe' if en else 'Черновик рецепта')
    path(d,(356,201),(569,201),gold=True,arrow=False)
    node(d,101,164,nm,body,w=255,expanded=expanded,selected=True)
    node(d,569,164,nm,body,w=255,expanded=expanded,selected=i==2)
    if i==0:
        d.ellipse([317,165,357,205],outline=GOLD,width=3)
    if i==2:
        for x in [112,580]:rr(d,[x,309,x+233,355],fill=None,outline=GOLD,width=2,r=4)
    txt(d,(480,416),'1 ID / 2 sheets' if en else '1 ID / 2 листа',12,GOLD,True,anchor='mm')
    return im

def ai(locale,i):
    en=locale=='en';captions=['Copy the PlyLoom v3 standard. Add your question and source materials.','AI returns v3 JSON. Definitions and values belong in separate fields.','Save as .json and import it. Invalid references are rejected.','Read the sheets. Review their boundaries and export a backup.'] if en else ['Скопируйте стандарт PlyLoom v3. Добавьте вопрос и исходные материалы.','ИИ возвращает JSON v3. Определения и значения атрибутов — в разных полях.','Сохраните .json и загрузите. Некорректные ссылки отклоняются.','Прочитайте листы, проверьте границы и сохраните резервную копию.']
    im,d=base(locale,i,'From source material to PlyLoom' if en else 'Из материалов — в PlyLoom',captions[i])
    labels=['Standard','AI + sources','Import JSON','Read sheets'] if en else ['Стандарт','ИИ + источники','Импорт JSON','Чтение листов']
    for j,label in enumerate(labels):
        x=24+j*234;rr(d,[x,109,x+218,152],fill='#553765' if i==j else '#ffffff',outline='#d9cde3',r=7);txt(d,(x+109,130),f'{j+1}. {label}',13,'#fff' if i==j else MUTED,True,anchor='mm')
    if i==0:
        rr(d,[79,183,881,427],fill='#fff');txt(d,(104,201),'PlyLoom v3 / '+('GENERATION CONTRACT' if en else 'СТАНДАРТ ГЕНЕРАЦИИ'),12,PURPLE,True)
        text=['One entity = one node ID','types + sheets + nodes + edges','Attribute definitions + typed values','Keep facts and hypotheses separate'] if en else ['Одна сущность = один ID узла','types + sheets + nodes + edges','Определения атрибутов + значения','Факты и гипотезы — отдельно']
        for j,s in enumerate(text):txt(d,(107,235+j*27),s,15,INK)
        rr(d,[104,364,429,405],fill='#553765',outline='#553765',r=7);txt(d,(267,385),'Copy AI standard' if en else 'Скопировать стандарт для ИИ',14,'#fff',True,anchor='mm')
    elif i==1:
        rr(d,[90,182,870,431],fill='#fff');txt(d,(113,196),'map.json',13,GOLD,True)
        code=['{','  "version": 3,','  "types": {"attributes": [','    {"id":"cost","label":"Cost","dataType":"number"}]},','  "sheets": [{"id":"product"}],','  "nodes": [{"id":"blend","sheets":["product"],','             "attributes":{"cost":null}}],','  "edges": []','}']
        for j,s in enumerate(code):txt(d,(115,224+j*23),s,14,INK,mono=True)
    elif i==2:
        rr(d,[130,196,830,408],fill='#fff');txt(d,(480,230),'map.json',26,INK,True,anchor='mm')
        txt(d,(480,279),'✓ JSON  ·  ✓ IDs  ·  ✓ endpoints',16,'#648975',True,anchor='mm')
        rr(d,[338,323,622,377],fill='#553765',outline='#553765',r=8);txt(d,(480,349),'Import a file' if en else 'Загрузить файл',17,'#fff',True,anchor='mm')
    else:
        sheet(d,[53,189,480,421],'Sheet: Product' if en else 'Лист: Продукт',True);sheet(d,[482,189,908,421],'Sheet: Money' if en else 'Лист: Деньги')
        path(d,(366,295),(584,295),gold=True,arrow=False)
        node(d,153,253,'Morning blend' if en else 'Смесь «Утро»','id: blend',selected=True)
        node(d,584,253,'Morning blend' if en else 'Смесь «Утро»','id: blend',selected=True)
        txt(d,(480,392),'Same identity, different context' if en else 'Один ID, разные контексты',14,GOLD,True,anchor='mm')
    return im

media={}
for locale in ['ru','en']:
    media[locale]={}
    for name,draw in [('lines',spread),('editing',editing),('ai',ai)]:
        frames=[draw(locale,i) for i in range(4)]
        # A stable palette avoids color flicker; frames remain still for reading.
        palette=frames[0].quantize(colors=128)
        indexed=[f.quantize(palette=palette,dither=Image.Dither.NONE) for f in frames]
        still=OUT/f'{name}-{locale}.png';gif=OUT/f'{name}-{locale}.gif'
        frames[0].save(still,optimize=True)
        indexed[0].save(gif,save_all=True,append_images=indexed[1:],duration=2200,loop=0,disposal=2,optimize=True)
        media[locale][name]={'poster':'data:image/png;base64,'+base64.b64encode(still.read_bytes()).decode(),'gif':'data:image/gif;base64,'+base64.b64encode(gif.read_bytes()).decode()}
(ROOT/'src/data/helpMedia.ts').write_text('// Generated by scripts/build_help_media.py. Original UI illustrations, not screenshots.\nexport const HELP_MEDIA = '+json.dumps(media,separators=(',',':'))+' as const;\n')
(OUT/'README.md').write_text('# Help illustrations\n\nOriginal instructional UI diagrams, drawn from the PlyLoom interaction design. These are not browser screenshots or evidence of browser QA.\n\nThree topics × Russian and English. Each GIF has four 2.2-second frames. PNG files are still keyframes; playback in the app is user-initiated.\n\nRebuild with `python scripts/build_help_media.py` (Pillow and DejaVu Sans required only for asset generation). Project MIT license applies.\n')
print(f'Created {len(media)*3} PNG/GIF pairs in {OUT}; all have four frames.')
