"""Build original SVG diagrams for documentation; these are not UI screenshots."""
from pathlib import Path
from html import escape
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/images'
OUT.mkdir(parents=True, exist_ok=True)

def text(x,y,s,size=20,color='#352544',weight=400):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}">{escape(s)}</text>'
def box(x,y,w,h,fill='#fff',stroke='#d9d1e3',r=14):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>'
def line(x,y,x2,y2,color='#79579a',dash=False):
    return f'<path d="M{x} {y} L{x2} {y2}" fill="none" stroke="{color}" stroke-width="3"'+(' stroke-dasharray="9 7"' if dash else '')+'/>'
def save(name,title,desc,parts,h=720):
    (OUT/name).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="{h}" viewBox="0 0 1200 {h}" role="img" aria-labelledby="title desc"><title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc><rect width="1200" height="{h}" fill="#f7f4fb"/><g font-family="DejaVu Sans, Arial, sans-serif">'+''.join(parts)+'</g></svg>')
for lang in ['ru','en']:
    en=lang=='en'
    p=[text(36,45,'PlyLoom · Sheets and the overview' if en else 'PlyLoom · Лист и обзор всех листов',28,weight=700),text(36,78,'Illustrated guide · the diagrams explain behaviour, not exact UI placement' if en else 'Учебная схема · показывает поведение, а не точную раскладку интерфейса',16,'#7e718c')]
    p += [box(36,110,400,320),text(58,148,'1 · Edit one sheet' if en else '1 · Редактировать лист',22,weight=700),box(350,164,62,34,'#eee5f7'),text(374,189,'−',24),text(58,198,'Product' if en else 'Продукт',17,'#7e718c')]
    p += [line(229,265,255,350,'#64748b'),box(65,223,240,66),text(82,250,'Shared node' if en else 'Общий узел',19,weight=600),text(82,276,'ID: blend',15,'#7e718c'),text(280,246,'+',21),box(215,325,190,65),text(232,360,'Process' if en else 'Процесс',19),text(58,410,'Drag nodes · edit text and attributes' if en else 'Узлы, текст и атрибуты',16,'#7e718c')]
    p += [line(459,242,515,242),text(466,222,'−',22),line(459,329,515,329),text(466,312,'+',22)]
    p += [box(540,110,624,320),text(562,147,'2 · Overview of all sheets' if en else '2 · Обзор всех листов',22,weight=700),text(562,179,'Selected sheet only: Product' if en else 'Связи выделенного листа: Продукт',17,'#79579a')]
    for x,y,label,active in [(562,206,'Product' if en else 'Продукт',True),(872,206,'Money' if en else 'Деньги',False),(872,305,'Checks' if en else 'Проверки',False)]:
        p += [box(x,y,265,88,'#fff','#79579a' if active else '#d9d1e3'),box(x,y,265,28,'#eee8f5',r=7),text(x+10,y+20,label,15,weight=600),text(x+240,y+21,'+',20),text(x+18,y+61,'blend',16,'#9a6129')]
    p += [line(659,260,881,260,'#b78425'),line(659,265,881,358,'#b78425'),text(561,418,'Drag headers · pan and zoom the overview' if en else 'Листы — за заголовки · обзор — за фон',16,'#7e718c')]
    p += [text(36,474,'Other views answer different questions' if en else 'Другие режимы решают отдельные задачи',23,weight=700)]
    for x,title,a,b in [(36,'Spread' if en else 'Разворот','Compare 2–6 sheets' if en else 'Сравнить 2–6 листов','Side by side' if en else 'Рядом, в заданных пропорциях'),(423,'Stack' if en else 'Стопка','Rows / Nodes & edges' if en else 'Построчно / Узлы и связи','Group by sheet type or tag' if en else 'Группировка по типу или тегу'),(810,'All-to-1' if en else 'Все на один лист','One appearance per entity' if en else 'Каждая сущность один раз','Separate saved positions' if en else 'Отдельная расстановка')]:
        p += [box(x,494,354,127),text(x+18,528,title,21,weight=700),text(x+18,562,a,16),text(x+18,591,b,16,'#7e718c')]
    p += [text(36,669,'Gold: same ID · dashed: cross-sheet relation · solid: relation within a sheet' if en else 'Золото: один ID · пунктир: связь между листами · сплошная: внутри листа',18)]
    save(f'views-{lang}.svg','PlyLoom views', 'Two-level sheet navigation and separate Spread, Stack and All-to-1 modes.',p)
    p=[text(36,45,'PlyLoom · Shared typed attributes' if en else 'PlyLoom · Общие типизированные атрибуты',28,weight=700),text(36,78,'Illustrated data flow · one definition, one value for each entity' if en else 'Учебная схема · определение в словаре, значение у сущности',17,'#7e718c')]
    p += [box(36,116,346,316),text(57,155,'1 · Define an attribute' if en else '1 · Завести атрибут',23,weight=700),text(57,191,'Types → Attributes' if en else 'Типы → Атрибуты',18,'#79579a'),text(57,242,'Name: Cost, ₽' if en else 'Название: Стоимость, ₽',19),text(57,276,'Data type: Number' if en else 'Тип данных: Число',19),text(57,322,'ID: cost',17,'#7e718c'),text(57,367,'types.attributes',17,'#79579a'),text(57,401,'Available to every node' if en else 'Доступен для добавления к узлам',15,'#7e718c')]
    p += [line(405,264,454,264),text(414,252,'→',23)]
    for x,sheet in [(478,'Product' if en else 'Продукт'),(848,'Money' if en else 'Деньги')]:
        p += [box(x,116,316,316),text(x+18,153,sheet,22,weight=700),box(x+18,179,280,217),text(x+33,213,'Morning blend' if en else 'Смесь «Утро»',19,weight=600),text(x+258,212,'−',23,'#79579a'),text(x+33,250,'ID: blend',15,'#7e718c'),text(x+33,284,'Recipe draft…' if en else 'Черновик рецепта…',17),box(x+33,309,248,58,'#f7f4fb'),text(x+46,345,'Cost, ₽: 125' if en else 'Стоимость, ₽: 125',19)]
    p += [line(778,236,866,236,'#b78425'),text(478,461,'One node ID → the same values on every sheet' if en else 'Один ID узла → одинаковые значения на всех листах',19,weight=600)]
    p += [box(36,491,1128,175),text(57,529,'Supported data types' if en else 'Доступные типы данных',21,weight=700),text(57,568,'Text · Number · Boolean · Date · URL · Single choice' if en else 'Текст · Число · Да/нет · Дата · URL · Один вариант из списка',20),text(57,610,'node.attributes: {"cost": 125} · null = attached but unset' if en else 'node.attributes: {"cost": 125} · null = добавлен, но ещё не заполнен',17,'#79579a'),text(57,644,'Illustrative values. Expand a node with + to edit its text and attributes.' if en else 'Значения вымышленные. «+» узла открывает его текст и атрибуты.',16,'#7e718c')]
    save(f'attributes-{lang}.svg','PlyLoom attributes','A numeric attribute definition is shared by two appearances of one node. Six data types are supported.',p)
print('Created four SVG documentation diagrams.')
