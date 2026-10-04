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
    var low = s.toLowerCase();
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
        var out;
        if (PATTERNS[j][1].indexOf("{1}") > -1) {
          if (m.length < 3) continue;
          var n1 = noun(m[1]), n2 = noun(m[2]);
          if (n1 == null || n2 == null) continue;
          out = PATTERNS[j][1].replace("{0}", n1).replace("{1}", n2);
        } else {
          var inner = noun(m[1]);
          if (inner == null) continue; // 该模式名词未知 → 尝试下一个模式
          out = PATTERNS[j][1].replace("{0}", inner);
        }
        return out;
      }
    }
    return noun(s);
  }

  /* 热键前缀拆分："Num 1 – Infinite Health" → ["Num 1", "Infinite Health"] */
  var HOTKEY_BODY = /^\s*((?:(?:L?Ctrl|L?Alt|L?Shift|Win|Cmd)\+\s*)*(?:Num(?:pad)?\s*[.+\-–—/]?\d+(?:\s*[-–—]\s*\d+)?|Num(?:pad)?\s*[.+\-–—/]|Numpad\s+\d+|F\d{1,2}))\s*[–—-]\s+(.+)$/i;

  function option(text) {
    if (!text) return null;
    var m = HOTKEY_BODY.exec(text);
    var prefix = "", bodyText = text;
    if (m && /num|f\d/i.test(m[1])) {
      prefix = m[1].replace(/\s+/g, " ").trim();
      bodyText = m[2];
    }
    var zh = body(bodyText);
    if (zh == null) return null;
    return prefix ? prefix + " – " + zh : zh;
  }

  return { option: option };
})();
