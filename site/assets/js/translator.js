/* 选项描述汉化词库（规则 + 词典）。
 * 原则：命中才译，未命中保留英文原文，绝不臆造。
 * 形如 "Num 1 – Infinite Health" 的选项会被拆成热键前缀 + 正文，正文按短语/模式/名词词典翻译。
 */
window.FLING_TRANSLATOR = (function () {
  "use strict";

  /* ---------- 整体短语（优先级最高） ---------- */
  var PHRASES = {
    "god mode": "无敌模式",
    "one-hit kills": "一击必杀",
    "one hit kills": "一击必杀",
    "one-hit kill": "一击必杀",
    "easy kills": "轻松击杀",
    "easy kill": "轻松击杀",
    "instant kill": "瞬间击杀",
    "instant kills": "瞬间击杀",
    "no reload": "无需换弹",
    "instant reload": "瞬间换弹",
    "super damage": "超级伤害",
    "stealth mode": "潜行模式",
    "undetected": "不被发现",
    "silent mode": "无声模式",
    "easy craft": "快速制作",
    "easy crafting": "快速制作",
    "no clip": "穿墙模式",
    "noclip": "穿墙模式",
    "ghost mode": "幽灵模式",
    "fly mode": "飞行模式",
    "flight mode": "飞行模式",
    "teleport": "传送",
    "freeze time": "冻结时间",
    "stop time": "停止时间",
    "time freeze": "时间冻结",
    "unlock all": "解锁全部",
    "unlock everything": "解锁全部",
    "no debt": "无债务",
    "super jump": "超级跳跃",
    "super speed": "超级速度",
    "mega jump": "超级跳跃",
    "infinite jumps": "无限跳跃",
    "air dash": "空中冲刺",
    "no fall damage": "无坠落伤害",
    "ignore craft requirements": "忽略制作需求",
    "ignore upgrade requirements": "忽略升级需求",
    "items don't decrease": "物品不减少",
    "items not decrease": "物品不减少",
    "fill inventory": "填满物品栏",
    "clear inventory": "清空物品栏",
    "day timer freeze": "天数计时冻结",
    "no wanted level": "无通缉等级",
    "zero gravity": "零重力",
    "special notes": "特别说明",
    "invincible": "无敌",
    "one hit kill": "一击必杀",
    "in battle": "战斗中",
    "slow motion": "慢动作",
    "save location": "保存坐标",
    "undo teleport": "撤销传送",
    "no random encounter": "无随机遭遇",
    "fast random encounter": "快速随机遭遇",
    "reveal full map": "揭示全地图",
    "change weather": "更改天气",
    "stable body temperature": "体温恒定",
    "disable fog of war": "关闭战争迷雾",
    "full health": "生命全满",
    "disable all": "全部禁用",
    "enable all": "全部启用",
    "no fatigue": "无疲劳",
    "no overheat": "无过热",
    "no fall damage": "无坠落伤害",
    "instant catch": "瞬间上钩",
    "one hit stun": "一击眩晕",
    "one hit stagger": "一击硬直",
    "one hit break": "一击击破",
    "one hit kill": "一击必杀",
    "max item quality": "物品品质最大化",
    "item quality": "物品品质",
    "stamina consumption rate": "体力消耗速率",
    "instant action": "瞬间行动",
    "undo teleport to waypoint": "撤销传送至路径点",
    "ignore hit": "忽略受击",
    "ignore hits": "忽略受击",
    "infinite mrp": "无限MRP",
    "edit mrp": "编辑MRP",
    "mrp multiplier": "MRP倍率",
    "mrp multiplier" : "MRP倍率"
  };

  /* ---------- 名词/名词短语词典（小写键，长键优先） ---------- */
  var NOUNS = {
    "movement speed": "移动速度", "walk speed": "步行速度", "run speed": "奔跑速度",
    "sprint speed": "冲刺速度", "game speed": "游戏速度", "attack speed": "攻击速度",
    "jump height": "跳跃高度", "fire rate": "射速", "firing rate": "射速",
    "skill points": "技能点", "skill point": "技能点", "stat points": "属性点",
    "melee damage": "近战伤害", "ranged damage": "远程伤害", "range damage": "远程伤害",
    "weapon durability": "武器耐久", "craft requirements": "制作需求",
    "upgrade requirements": "升级需求", "day timer": "天数计时",
    "clock time": "时钟时间", "item usage": "物品消耗", "ammo count": "弹药数量",
    "wanted level": "通缉等级", "crit chance": "暴击率", "crit damage": "暴击伤害",
    "critical chance": "暴击率", "armor class": "护甲等级", "health kit": "医疗包",
    "health kits": "医疗包", "throw count": "投掷次数", "combo counter": "连击计数",
    "max combo": "最大连击", "time of day": "一天中的时刻", "car health": "车辆生命",
    "use count": "使用次数",
    "machine gun ammo": "机枪弹药", "machine gun": "机枪",
    "sp weapon ammo": "特殊武器弹药", "sp weapon": "特殊武器",
    "mission time": "任务时间", "mission timer": "任务计时器",
    "time pass speed": "时间流逝速度", "enemy speed": "敌人速度",
    "food stockpiles": "食物储备", "building material requirements": "建筑材料需求",
    "embarkation points": "启程点数", "seal fragments": "封印碎片",
    "villager resolve": "村民决心", "queen impatience": "女王的不耐",
    "forest hostility": "森林敌意", "hearth corruption": "炉巢腐化",
    "part slot limit": "零件槽位限制", "parts weight": "零件重量",
    "missiles": "导弹", "missile": "导弹", "flares": "干扰弹", "flare": "干扰弹",
    "torpedoes": "鱼雷", "torpedo": "鱼雷", "parts": "零件", "component": "零件",
    "components": "零件", "mrp": "MRP",
    "enemy": "敌人", "enemies": "敌人", "ally": "友军", "allies": "友军",
    "units": "单位", "unit": "单位", "buildings": "建筑", "building": "建筑",
    "settlements": "聚居地", "settlement": "聚居地", "villagers": "村民",
    "villager": "村民", "workers": "工人", "civilians": "平民", "recruits": "新兵",
    "resources": "资源", "amount": "数量", "machinery": "机械",
    "artifacts": "神器", "artifact": "神器", "fragment": "碎片", "fragments": "碎片",
    "resolve": "决心", "impatience": "不耐", "hostility": "敌意", "corruption": "腐化",
    "morale": "士气", "population": "人口", "influence": "影响力",
    "authority": "权威", "prestige": "威望", "stockpile": "储备", "stockpiles": "储备",
    "slot": "槽位", "limit": "限制", "embarkation": "启程", "queen": "女王",
    "reset": "重置", "clear": "清除", "complete": "完成", "recruit": "招募",
    "repair": "维修", "hull": "船体", "shield": "护盾", "shields": "护盾",
    "homing": "制导", "lock-on": "锁定", "radar": "雷达", "countermeasure": "干扰",
    "boost": "推进", "thrust": "推力", "flight time": "飞行时间",
    "population cap": "人口上限", "move points": "行动点",
    "shipments": "货物", "proficiency": "熟练度", "thrall": "奴仆",
    "war spoils": "战利品", "hurry production": "加速生产",
    "recruitments": "招募", "casting points": "施法点",
    "world map": "世界地图", "combat": "战斗", "empire": "帝国",
    "development": "发展", "affinity": "倾向", "cooldown": "冷却",
    "ai": "AI", "hits": "受击", "binding": "束缚", "turn": "回合",
    "research points": "研究点数", "production": "生产",
    "resistance": "抗性", "poison": "毒", "fire": "火", "electricity": "雷电",
    "lightning": "雷电", "ice": "冰", "frost": "冰霜", "shatter": "碎击",
    "physical": "物理", "piercing": "穿刺", "slashing": "斩击", "magic": "魔法",
    "dark": "暗", "light": "光", "wind": "风", "earth": "地",
    "vitality": "活力", "strength": "力量", "technique": "技巧", "spirit": "精神",
    "stability": "稳定", "conversion": "转化", "goods": "商品", "crystal": "水晶",
    "crew": "船员", "crews": "船员", "worker": "工人", "build": "建造",
    "movement": "移动", "move": "移动", "world": "世界", "casting": "施法",
    "structure": "结构", "enhancement": "强化", "requirements": "需求",
    "requirement": "需求", "sync rate": "同步率",
    "soul": "灵魂", "life": "生命", "drop": "掉落", "rate": "率",
    "rapid fire": "连发", "flashlight": "手电筒", "healing": "治疗",
    "battery packs": "电池组", "selected": "所选", "manuscript": "手稿",
    "kills": "击杀", "kill": "击杀", "ability": "技能", "abilities": "技能",
    "npc": "NPC", "bots": "机器人", "bot": "机器人", "friendly fire": "友军伤害",
    "revives": "复活次数", "revive": "复活", "overheat": "过热",
    "requisition": "补给", "resource": "资源", "mission reward": "任务奖励",
    "reward": "奖励", "credits": "点数",
    "max": "最大", "minimum": "最低", "fov": "视野", "drink": "饮品",
    "leisure": "娱乐", "qi": "气", "fly height": "飞行高度",
    /* ---- 批量补充（基于全量 757 款游戏 16285 条选项的频次分析）---- */
    /* 属性缩写与数值 */
    "sp": "SP", "ap": "AP", "ep": "EP", "cp": "CP", "bp": "BP", "cc": "CC",
    "tp": "TP", "atk": "攻击", "def": "防御", "agi": "敏捷", "int": "智力",
    "luk": "幸运", "dex": "灵巧", "con": "体质", "vit": "体力", "ki": "气",
    "k.o.": "击倒", "musou": "无双", "amplifier": "增幅", "gauge": "槽",
    "heat gauge": "热量条", "burst gauge": "爆发槽", "skill gauge": "技能槽",
    /* 货币 / 点数（含各游戏专有货币）*/
    "gil": "吉尔", "mira": "米拉", "sepith": "晶石", "cole": "科尔",
    "munny": "金币", "casino chips": "赌场筹码", "chips": "筹码",
    "talent points": "天赋点", "attribute points": "属性点", "action points": "行动点",
    "tech points": "科技点", "mastery": "精通度", "silver": "白银", "bronze": "青铜",
    "medals": "勋章", "tokens": "代币", "tickets": "票券",
    /* 战斗状态 / 属性 */
    "attack": "攻击", "magic attack": "魔法攻击", "physical attack": "物理攻击",
    "dexterity": "灵巧", "agility": "敏捷", "intelligence": "智力",
    "constitution": "体质", "charm": "魅力", "base stats": "基础属性",
    "attack stat": "攻击力", "defense stat": "防御力", "dodge chance": "闪避率",
    "evade chance": "闪避率", "hit chance": "命中率", "acceleration": "加速",
    "stun": "眩晕", "stagger": "硬直", "break": "击破", "aggro": "仇恨",
    "rage": "怒气", "fatigue": "疲劳", "fullness": "饱食度", "happiness": "幸福度",
    "buff": "增益", "debuff": "减益", "buff duration": "增益持续时间",
    "duration": "持续时间", "cooldowns": "冷却", "status": "状态",
    "bleed": "流血", "burn": "燃烧", "shock": "感电", "curse": "诅咒",
    "silence": "沉默", "immunity": "免疫", "poison": "毒", "shield": "护盾",
    "regen": "回复", "regeneration": "回复", "recovery": "恢复",
    "consumption": "消耗", "consumption rate": "消耗速率", "thorns": "荆棘",
    /* 装备 / 物品 */
    "equipment": "装备", "equipment durability": "装备耐久", "accessory": "饰品",
    "accessories": "饰品", "attachment": "配件", "crafting material": "制作材料",
    "crafting materials": "制作材料", "upgrade materials": "升级材料",
    "quality": "品质", "inventory size": "物品栏容量", "capacity": "容量",
    "stock": "库存", "item slot": "物品栏位", "loadout": "配装",
    "arrow": "箭", "arrows": "箭", "ammunition": "弹药", "ammo capacity": "弹药容量",
    "watering can": "水壶", "watering can usage": "水壶使用次数",
    "repair kit": "修理包", "key item": "关键道具", "key items": "关键道具",
    /* 世界 / 环境 / 时间 */
    "daytime": "白天", "nighttime": "夜晚", "hour": "小时", "minute": "分钟",
    "second": "秒", "encounter": "遭遇", "random encounter": "随机遭遇",
    "waypoint": "路径点", "marker": "标记点", "objective": "目标",
    "dungeon": "地牢", "chest": "宝箱", "loot": "战利品", "spawn": "刷怪",
    "spawn rate": "刷怪率", "fog of war": "战争迷雾", "fast travel": "快速旅行",
    "world map": "世界地图", "region": "地区", "zone": "区域", "biome": "生态区",
    /* 经济 / 生产 / 建造 */
    "price": "价格", "cost": "花费", "shop": "商店", "trade": "交易",
    "growth": "增长", "birth rate": "出生率", "storage": "仓储",
    "farm": "农田", "crop": "作物", "crops": "作物", "animal": "动物",
    "animals": "动物", "breeding": "繁殖", "livestock": "牲畜",
    "production rate": "生产速率", "work speed": "工作效率", "craft speed": "制作速度",
    /* 载具 / 飞行 */
    "nitro": "氮气", "altitude": "高度", "boost gauge": "推进槽",
    "fuel consumption": "燃料消耗", "vehicle durability": "载具耐久",
    /* 通用修饰 */
    "full": "满", "all": "全部", "selected": "所选", "clicked": "点击的",
    "dragged": "拖拽的", "nearby": "附近", "each": "每个", "per second": "每秒",
    "per turn": "每回合", "per minute": "每分钟", "per hour": "每小时",
    "amount": "数量", "count": "数量", "size": "大小", "value": "数值",
    "chance": "概率", "rate": "速率", "ratio": "比率", "range": "范围",
    "level cap": "等级上限", "max level": "最高等级", "requirement": "需求",
    "requirements": "需求", "condition": "条件", "conditions": "条件",
    "penalty": "惩罚", "bonus": "加成", "effect": "效果", "effects": "效果",
    "timer": "计时器", "challenge timer": "挑战计时", "battle timer": "战斗计时",
    "shift": "班次", "schedule": "排班", "budget": "预算", "income": "收入",
    "expense": "支出", "tax": "税金", "wage": "工资", "salary": "薪水",
    "employees": "员工", "citizen": "市民", "citizens": "市民", "guest": "客人",
    "guests": "客人", "customer": "顾客", "customers": "顾客", "student": "学生",
    "students": "学生", "soldier": "士兵", "soldiers": "士兵", "troop": "部队",
    "troops": "部队", "army": "军队", "navy": "海军", "fleet": "舰队",
    "morale": "士气", "supply": "补给", "supplies": "补给", "logistics": "后勤",
    /* ---- 第二批：长尾通用词 ---- */
    "character": "角色", "characters": "角色", "character stats": "角色属性",
    "double jump": "二段跳", "double jumps": "二段跳", "dash": "冲刺", "dashes": "冲刺次数",
    "options": "选项", "option": "选项", "minigame": "小游戏", "minigames": "小游戏",
    "location": "地点", "saved location": "已保存坐标", "mass": "量", "amounts": "数量",
    "credit": "信用点", "credits": "信用点", "swim speed": "游泳速度", "fishing": "钓鱼",
    "foods": "食物", "material": "材料", "materials": "材料", "delay": "延迟",
    "zero delay": "零延迟", "saved": "已保存", "destroy": "摧毁", "teammate": "队友",
    "teammates": "队友", "throwable": "投掷物", "throwables": "投掷物",
    "construction": "建造", "horse": "马", "job": "职业", "jobs": "职业",
    "gift": "礼物", "gifts": "礼物", "awaken": "觉醒", "hit rate": "命中率",
    "evasion": "闪避", "evasion rate": "闪避率", "shortcut": "快捷", "shortcuts": "快捷",
    "sleep": "睡眠", "sleepiness": "困倦", "lapse": "流逝", "elapse": "流逝",
    "time lapse speed": "时间流逝速度", "time elapse speed": "时间流逝速度",
    "armor": "护甲", "armors": "护甲", "contribution": "贡献", "lumber": "木材",
    "level up": "升级", "highlight": "高亮", "interactable": "可交互物",
    "interactables": "可交互物", "auto": "自动", "en": "EN", "treasury": "国库",
    "willpower": "意志力", "ship": "船", "ships": "船只", "metal": "金属",
    "metals": "金属", "core shard": "核心碎片", "core shards": "核心碎片",
    "crystal shard": "水晶碎片", "crystal shards": "水晶碎片",
    "poise": "韧性", "spoil": "腐坏", "play time": "游戏时间", "wisdom": "智慧",
    "action": "行动", "actions": "行动", "ignore": "忽略", "sepith mass": "晶石量",
    "puni": "噗尼", "puni stats": "噗尼属性", "puni exp": "噗尼经验",
    "t-lv": "T-Lv", "awaken gauge": "觉醒槽", "shogi points": "将棋点数",
    "wooden tags": "木牌", "treasury": "国库", "contribution": "贡献度",
    "scrap": "废料", "scraps": "废料", "parts": "零件", "circuit": "电路",
    "circuits": "电路", "gear": "装备品", "gears": "装备品", "module": "模块",
    "modules": "模块", "chip": "芯片", "chips": "芯片", "battery": "电池",
    "batteries": "电池", "core": "核心", "cores": "核心", "shard": "碎片",
    "shards": "碎片", "fragment": "碎片", "fragments": "碎片", "relic": "遗物",
    "relics": "遗物", "artifact": "神器", "artifacts": "神器", "blueprint": "蓝图",
    "blueprints": "蓝图", "recipe": "配方", "recipes": "配方", "ingot": "锭",
    "ingots": "锭", "ore": "矿石", "bars": "锭", "herb": "药草", "herbs": "药草",
    "seed": "种子", "seeds": "种子", "fertilizer": "肥料", "fish": "鱼",
    "insect": "昆虫", "insects": "昆虫", "monster": "怪物", "monsters": "怪物",
    "boss": "首领", "enemy": "敌人", "enemies": "敌人", "npc": "NPC",
    "companion": "同伴", "companions": "同伴", "summon": "召唤兽",
    "summons": "召唤兽", "pet": "宠物", "pets": "宠物", "mount": "坐骑",
    "mounts": "坐骑", "party": "队伍", "team": "队伍", "squad": "小队",
    "squads": "小队", "unit": "单位", "units": "单位", "hero": "英雄",
    "heroes": "英雄", "npc allies": "NPC 友军", "ally": "友军", "allies": "友军",
    /* ---- 第三批 ---- */
    "battle": "战斗", "base": "基础", "gather": "采集", "send": "发送",
    "container": "容器", "wait": "等待", "no wait time": "无等待时间",
    "bond": "羁绊", "endurance": "耐力", "vigor": "精力", "mag": "魔法",
    "iron": "铁", "jam": "干扰", "bomb": "炸弹", "bombs": "炸弹",
    "storage space": "仓储空间", "hygiene": "卫生", "drunk level": "醉酒等级",
    "keyblade": "键刃", "keyblades": "键刃", "invulnerable": "无敌",
    "teleportation": "传送", "watering": "浇水", "scores": "分数",
    "sprint speed": "冲刺速度", "walk speed": "步行速度", "jump height": "跳跃高度",
    "reload speed": "换弹速度", "fire rate": "射速", "attack range": "攻击范围",
    "detection": "侦测", "visibility": "可见度", "noise": "噪音",
    "wanted": "通缉", "notoriety": "恶名", "bounty": "赏金", "crime": "犯罪",
    "combo": "连击", "combo gauge": "连击槽", "hit count": "连击数",
    "combo count": "连击数", "counter": "反击", "parry": "格挡",
    "block": "格挡", "guard": "防御", "dodge": "闪避", "roll": "翻滚",
    "sprint": "冲刺", "climb": "攀爬", "swim": "游泳", "glide": "滑翔",
    "health": "生命", "stamina": "体力", "ammo": "弹药", "money": "金钱",
    "gold": "金币", "credits": "点数", "cash": "现金", "coins": "金币",
    "items": "物品", "item": "物品", "xp": "经验", "exp": "经验",
    "experience": "经验", "level": "等级", "levels": "等级", "speed": "速度",
    "damage": "伤害", "defense": "防御", "defence": "防御", "armor": "护甲",
    "armour": "护甲", "grenades": "手雷", "potion": "药水", "potions": "药水",
    "arrows": "箭", "mana": "魔法值", "mp": "魔法值", "hp": "生命值",
    "fuel": "燃料", "battery": "电量", "batteries": "电池", "charge": "电量",
    "hunger": "饥饿", "thirst": "口渴", "sanity": "理智", "durability": "耐久",
    "weight": "负重", "inventory": "物品栏", "crafting": "制作", "craft": "制作",
    "building": "建造", "research": "研究", "time": "时间", "day": "天数",
    "days": "天数", "weather": "天气", "stealth": "潜行", "recoil": "后坐力",
    "reload": "换弹", "accuracy": "精准", "spread": "散布", "range": "射程",
    "throw": "投掷", "throws": "投掷", "ride": "骑乘", "mount": "坐骑",
    "companion": "同伴", "companions": "同伴", "pet": "宠物", "pets": "宠物",
    "prayer": "祈祷", "faith": "信仰", "focus": "专注", "adrenaline": "肾上腺素",
    "consumables": "消耗品", "resources": "资源", "materials": "材料",
    "ingredients": "材料", "weapons": "武器", "weapon": "武器", "energy": "能量",
    "power": "能量", "clock": "时钟", "timer": "计时器", "car": "车辆",
    "vehicle": "载具", "vehicles": "载具", "player": "玩家", "jump": "跳跃",
    "sprint": "冲刺", "walk": "步行", "run": "奔跑", "oxygen": "氧气",
    "breath": "氧气", "air": "氧气", "luck": "幸运", "charisma": "魅力",
    "reputation": "声望", "stats": "属性", "attributes": "属性", "perks": "专长",
    "perk": "专长", "upgrades": "升级", "upgrade": "升级", "skills": "技能",
    "skill": "技能", "tech": "科技", "recipes": "配方", "blueprints": "蓝图",
    "maps": "地图", "achievements": "成就", "challenges": "挑战",
    "missions": "任务", "quests": "任务", "contracts": "合同", "bounty": "赏金",
    "debt": "债务", "bills": "账单", "rent": "租金", "taxes": "税款",
    "mode": "模式", "usage": "消耗", "uses": "使用次数", "clip": "弹匣",
    "magazine": "弹匣", "lockpick": "撬锁", "cops": "通缉", "heat": "通缉",
    "noise": "噪音", "visibility": "可见度", "flight": "飞行", "gravity": "重力",
    "crit": "暴击", "critical": "暴击", "lifesteal": "生命偷取", "combo": "连击",
    "infection": "感染", "radiation": "辐射", "temperature": "体温",
    "stress": "压力", "mood": "心情", "affection": "好感度", "friendship": "友谊",
    "relationship": "关系", "loyalty": "忠诚", "gems": "宝石", "diamonds": "钻石",
    "tickets": "票据", "tokens": "代币", "souls": "灵魂", "essence": "精华",
    "crystals": "水晶", "ore": "矿石", "wood": "木材", "stone": "石头",
    "food": "食物", "water": "水", "supplies": "补给", "medicine": "药品",
    "bandages": "绷带", "medkits": "医疗包", "skill cooldown": "技能冷却",
    "cooldown": "冷却", "cooldowns": "冷却", "score": "分数", "points": "点数"
  };

  /* ---------- 模式规则（按顺序取第一个命中） ---------- */
  var PATTERNS = [
    [/^infinite\s+(.+)$/, "无限{0}"],
    [/^unlimited\s+(.+)$/, "无限{0}"],
    [/^endless\s+(.+)$/, "无限{0}"],
    [/^no\s+(.+)$/, "无{0}"],
    [/^without\s+(.+)$/, "无{0}"],
    [/^freeze\s+(.+)$/, "冻结{0}"],
    [/^frozen\s+(.+)$/, "冻结{0}"],
    [/^(?:super|mega)\s+(.+)$/, "超级{0}"],
    [/^(?:max|maximum)\s+(.+)$/, "{0}最大化"],
    [/^set\s+(.+)$/, "设置{0}"],
    [/^edit\s+(.+)$/, "编辑{0}"],
    [/^(?:add|increase)\s+(.+)$/, "增加{0}"],
    [/^(?:decrease|reduce)\s+(.+)$/, "减少{0}"],
    [/^unlock\s+all\s+(.+)$/, "解锁全部{0}"],
    [/^unlock\s+(.+)$/, "解锁{0}"],
    [/^disable\s+(.+)$/, "禁用{0}"],
    [/^enable\s+(.+)$/, "启用{0}"],
    [/^allow\s+(.+)$/, "允许{0}"],
    [/^(?:restore|refill|replenish)\s+(.+)$/, "回满{0}"],
    [/^(?:fast|quick)\s+(.+)$/, "快速{0}"],
    [/^easy\s+(.+)$/, "轻松{0}"],
    [/^ignore\s+(.+)$/, "忽略{0}"],
    [/^stop\s+(.+)$/, "停止{0}"],
    [/^reset\s+(.+)$/, "重置{0}"],
    [/^clear\s+(.+)$/, "清除{0}"],
    [/^zero\s+(.+)$/, "{0}归零"],
    [/^empty\s+(.+)$/, "清空{0}"],
    [/^drain\s+(.+)$/, "吸取{0}"],
    [/^one\s+turn\s+(.+)$/, "一回合{0}"],
    [/^(?:ai\s+)?can(?:'|’|')t\s+(.+)$/, "无法{0}"],
    [/^set\s+(.+?)\s+to\s+\d+$/, "设置{0}"],
    [/^fill\s+(.+)$/, "填满{0}"],
    [/^instant\s+(.+)$/, "瞬间{0}"],
    [/^free\s+(.+)$/, "免费{0}"],
    [/^low\s+(.+)$/, "低{0}"],
    [/^high\s+(.+)$/, "高{0}"],
    [/^(.+)\s+multiplier$/, "{0}倍率"],
    [/^(.+)\s+freeze$/, "冻结{0}"],
    [/^(.+)\s+no\s+cooldown$/, "{0}无冷却"],
    [/^(.+)\s+cooldown$/, "{0}冷却"],
    [/^(.+?)\s+can(?:'|’|')t\s+(.+)$/, "{0}无法{1}"],
    [/^(.+?)\s+won(?:'|’|')t\s+decrease$/, "{0}不会减少"],
    [/^100%\s+(.+)$/, "100%{0}"],
    [/^(.+)\s+infinite\s+(.+)$/, "{0}无限{1}"],
    [/^(.+)\s+instant\s+cooldown$/, "{0}瞬间冷却"],
    [/^obtain\s+all\s+(.+)$/, "获得全部{0}"],
    [/^obtain\s+(.+)$/, "获得{0}"],
    [/^reveal\s+all\s+(.+)$/, "揭示全部{0}"],
    [/^reveal\s+(.+)$/, "揭示{0}"],
    [/^change\s+(.+)$/, "更改{0}"],
    [/^gather\s+(.+)$/, "采集{0}"],
    [/^undo\s+(.+)$/, "撤销{0}"],
    [/^toggle\s+(.+)$/, "切换{0}"],
    [/^remove\s+(.+)$/, "移除{0}"],
    [/^skip\s+(.+)$/, "跳过{0}"],
    [/^stable\s+(.+)$/, "{0}恒定"],
    [/^full\s+(.+)$/, "{0}全满"],
    [/^all\s+(.+)$/, "全部{0}"],
    [/^always\s+(.+)$/, "始终{0}"],
    [/^teleport\s+to\s+(.+)$/, "传送至{0}"],
    [/^one\s+hit\s+(.+)$/, "一击{0}"],
    [/^(.+)\s+no\s+overheat$/, "{0}无过热"],
    [/^(.+)\s+won(?:'|’|')t\s+(?:decrease|drop|reduce|spoil|be consumed)$/, "{0}不会减少"],
    [/^(.+?)\s*\+\s*(\d+)\s*hours?$/, "{0} +{raw1}小时"],
    [/^(.+?)\s*-\s*(\d+)\s*hours?$/, "{0} -{raw1}小时"],
    [/^(.+)\s+mode$/, "{0}模式"]
  ];

  var NOUN_KEYS = Object.keys(NOUNS).sort(function (a, b) { return b.length - a.length; });

  /* 名词短语翻译：整体命中 → 逐词命中拼接；失败返回 null */
  function noun(phrase) {
    var p = phrase.trim().toLowerCase().replace(/['’`]/g, "").replace(/\s+/g, " ");
    if (!p) return null;
    if (NOUNS[p]) return NOUNS[p];
    var tokens = p.split(" ");
    var out = [];
    for (var i = 0; i < tokens.length; i++) {
      if (!NOUNS[tokens[i]]) return null;
      out.push(NOUNS[tokens[i]]);
    }
    return out.join("");
  }

  /* 正文翻译：短语 → 冒号结构 → 组合(/、&) → 模式 → 名词；未命中返回 null */
  function body(text) {
    var s = text.trim().replace(/\s+/g, " ");
    if (!s) return null;
    var low = s.toLowerCase().replace(/[’`´]/g, "'"); // 撇号归一，兼容数据里的弯引号
    if (PHRASES[low]) return PHRASES[low];

    /* 去掉尾部括号补充说明 "(Infinite Population)" 等，主副分别尝试翻译 */
    var pm = /^(.*?)\s*\(([^()]+)\)$/.exec(s);
    if (pm && pm[1].trim()) {
      var mainZh = body(pm[1].trim());
      var subZh = body(pm[2].trim());
      if (mainZh == null) return null;
      if (subZh != null) return mainZh + "（" + subZh + "）";
      return mainZh;
    }

    /* "Player Units: Infinite Health" 冒号结构 → {X}：{Y} */
    var ci = s.indexOf(": ");
    if (ci > 0) {
      var leftZh = body(s.slice(0, ci));
      var rightZh = body(s.slice(ci + 2));
      if (leftZh != null && rightZh != null) return leftZh + "：" + rightZh;
      return null;
    }

    /* 组合式："God Mode/Ignore Hits"、"Infinite Missiles & SP Weapon Ammo" */
    var parts;
    if (s.indexOf("/") > -1) parts = s.split("/");
    else if (/\s&\s/i.test(s)) parts = s.split(/\s+&\s+/i);
    if (parts && parts.length > 1) {
      var translated = [];
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        if (!p) return null;
        var one = body(p);
        if (one == null) return null;
        translated.push(one);
      }
      return s.indexOf("/") > -1 ? translated.join("/") : translated.join("、");
    }

    for (var j = 0; j < PATTERNS.length; j++) {
      var m = PATTERNS[j][0].exec(low);
      if (m) {
        var tpl = PATTERNS[j][1];
        if (tpl.indexOf("{raw1}") > -1) {
          // 数字原样保留（如 "Daytime +1 Hour" → 白天 +1小时）
          var base = noun(m[1]);
          if (base == null) continue;
          return tpl.replace("{0}", base).replace("{raw1}", m[2]);
        }
        var out;
        if (tpl.indexOf("{1}") > -1) {
          if (m.length < 3) continue;
          var n1 = noun(m[1]), n2 = noun(m[2]);
          if (n1 == null || n2 == null) continue;
          out = tpl.replace("{0}", n1).replace("{1}", n2);
        } else {
          var inner = noun(m[1]);
          if (inner == null) continue; // 该模式名词未知 → 尝试下一个模式
          out = tpl.replace("{0}", inner);
        }
        return out;
      }
    }
    return noun(s);
  }

  /* 热键前缀拆分："Num 1 – Infinite Health" → ["Num 1", "Infinite Health"] */
  var HOTKEY_BODY = /^\s*((?:(?:L?Ctrl|L?Alt|L?Shift|Win|Cmd)\+\s*)*(?:Num(?:pad)?\s*[.+\-–—/*]?\d*(?:\s*[-–—]\s*\d+)?|Num(?:pad)?\s*[.+\-–—/*]|Numpad\s+\d+|F\d{1,2}|Home|End|Insert|Delete|Del|Tab|Space|Enter|PgUp|PgDn|Backspace))\s*[–—-]\s+(.+)$/i;

  function option(text) {
    if (!text) return null;
    var m = HOTKEY_BODY.exec(text);
    var prefix = "", bodyText = text;
    if (m) {
      prefix = m[1].replace(/\s+/g, " ").trim();
      bodyText = m[2];
    }
    var zh = body(bodyText);
    if (zh == null) return null;
    return prefix ? prefix + " – " + zh : zh;
  }

  return { option: option };
})();
