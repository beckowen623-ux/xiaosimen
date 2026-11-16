window.XIAOSIMEN_KEY_POINTS ||= {};
window.XIAOSIMEN_KEY_POINTS.lishi = {
  sources: {
    standard: {
      label: '教育部《义务教育历史课程标准（2022年版）》',
      url: 'https://www.moe.gov.cn/srcsite/A26/s8001/202204/W020220420582345700037.pdf'
    },
    pep7up: {
      label: '人教社《中国历史》七年级上册修订说明',
      url: 'https://www.pep.com.cn/bks/zxxjcjx/jcb/202504/W020250417349110324283.pdf'
    },
    pep7upText: {
      label: '人教社《中国历史》七年级上册（旧版电子教材，供史实对照）',
      url: 'https://c1.ykt.cbern.com.cn/%E5%90%88%E5%B9%B6%E7%94%B5%E5%AD%90%E6%95%99%E6%9D%90/0321/%E7%BB%9F%E7%BC%96%E7%89%88/%E5%88%9D%E4%B8%AD/%E5%8E%86%E5%8F%B2/%E4%B8%83%E5%B9%B4%E7%BA%A7/%E4%B9%89%E5%8A%A1%E6%95%99%E8%82%B2%E6%95%99%E7%A7%91%E4%B9%A6%C2%B7%E5%8E%86%E5%8F%B2%E4%B8%83%E5%B9%B4%E7%BA%A7%E4%B8%8A%E5%86%8C.pdf'
    },
    pep7down: {
      label: '人教社《中国历史》七年级下册修订教材试教说明',
      url: 'https://www.pep.com.cn/xw/zt/hd/sktbjc/jcsy/202606/t20260610_2006778.html'
    },
    pep8: {
      label: '人教社《新修订初中历史八年级统编教材使用建议》',
      url: 'https://www.pep.com.cn/bks/kcjcjf/xszh/202510/W020251016510253664703.pdf'
    },
    pep9upRevised: {
      label: '人教社关于新修订历史教材的解读（含九年级上册）',
      url: 'https://www.pep.com.cn/xw/zt/hd/sktbjc/zcjd/202606/t20260612_2006874.html'
    },
    pep9up: {
      label: '人教社《世界历史》九年级上册（旧版电子教材，供史实对照）',
      url: 'https://r3-ndr.ykt.cbern.com.cn/edu_product/esp/assets_document/61a4f9ac-8bc0-437b-bbc2-f2f86d0ae65c.pkg/pdf.pdf'
    },
    pep9down: {
      label: '人教社修订教材单元页说明（含世界历史九年级下册）',
      url: 'https://www.pep.com.cn/xw/zt/hd/sktbjc/zcjd/202606/t20260612_2006844.html'
    },
    fujian2024: {
      label: '福州市教育局：2024年福建中考原卷和参考答案',
      url: 'https://jyj.fuzhou.gov.cn/zwgk/cswz/fzygzz/tzgg/202406/t20240621_4847383.htm'
    },
    fujian2025: {
      label: '福州市教育局：2025年福建中考原卷和参考答案',
      url: 'https://jyj.fuzhou.gov.cn/zwgk/cswz/fzygzz/tzgg/202506/t20250621_5036744.htm'
    },
    fujian2026: {
      label: '福州市教育局：2026年福建中考原卷和参考答案',
      url: 'https://jyj.fuzhou.gov.cn/zwgk/cswz/fzygzz/tzgg/202606/t20260623_5337122.htm'
    }
  },
  items: [
    {
      id: 'lishi-early-civilizations', stage: '7-up', topic: '中国古代史', type: 'core',
      title: '考古证据：分布广和有交流怎么分',
      rule: '辽河、黄河、长江流域都有早期遗址和文物，可据此了解中华文明的多元起源。若不同时地的器物在工艺、形制上有共同点，还可寻找区域间交融、传承的线索。',
      pitfall: '不同地方都有发现，直接说明分布较广；器物相似可以提示交流，单凭相似还不能确定谁传给了谁。',
      question: '两地出土年代接近、纹样相近的陶器，能否仅凭纹样确定是甲地传给乙地？',
      answer: '不能。纹样相近支持交流的推测，传播方向还需要其他证据。',
      evidence: '2026福建历史第1题',
      refs: ['pep7up', 'fujian2024', 'fujian2026']
    },
    {
      id: 'lishi-enfeoffment-commandery', stage: '7-up', topic: '中国古代史', type: 'trap',
      title: '西周分封和秦朝郡县，看地方官怎么来',
      rule: '西周以分封诸侯来治理地方，诸侯须承担进贡、出兵等义务。春秋诸侯势力上升，周王室权威逐渐衰落。秦统一六国后，在全国推行郡县制，地方主要官员由中央任免。',
      pitfall: '周天子分封诸侯，封国有世袭的一面；秦朝的郡守、县令是朝廷任命的官员，不能把职位传给后代。',
      question: '某地长官不能把官位传给儿子，继任者由中央派来，更符合西周分封还是秦朝郡县？',
      answer: '秦朝郡县制。',
      evidence: '2024福建历史第3题',
      refs: ['pep7upText', 'fujian2024', 'fujian2025']
    },
    {
      id: 'lishi-confucius-teaching', stage: '7-up', topic: '中国古代史', type: 'trap',
      title: '孔子的有教无类和因材施教',
      rule: '把两句话分开记：有教无类谈谁能受教育，不因出身而把人排除在外；因材施教谈怎么教，老师根据学生的性格和学习情况调整教学方法。',
      pitfall: '材料若强调不同背景都能入学，选有教无类；若强调面对不同学生用了不同办法，选因材施教。',
      question: '教师让基础薄弱的学生先练例题，让熟练的学生去做变式，这体现孔子的哪种教育思想？',
      answer: '因材施教。',
      evidence: '2024福建历史第2题',
      refs: ['pep7upText', 'standard', 'fujian2024']
    },
    {
      id: 'lishi-silk-road', stage: '7-up', topic: '中国古代史', type: 'core',
      title: '张骞通西域与丝绸之路',
      rule: '西汉张骞两次出使西域，为古代丝绸之路的开通创造了条件。陆路从长安经河西走廊通向西域，并继续向西延伸，带动商品、技术和文化在沿线传播。',
      pitfall: '丝绸之路不是一条只往外运丝绸的路。西域乃至更远地区的物产和艺术也传入中国，交流是双向的。',
      question: '汉朝的丝织品向西运输，西域的葡萄等物产向东传播，这反映丝绸之路的什么特点？',
      answer: '促进东西方双向交流。',
      evidence: '2024福建历史第4题',
      refs: ['pep7upText', 'fujian2024', 'fujian2026']
    },
    {
      id: 'lishi-northern-wei-reform', stage: '7-up', topic: '中国古代史', type: 'core',
      title: '北魏孝文帝改革为什么促进民族交融',
      rule: '北魏孝文帝把都城迁到洛阳，推行朝廷使用汉语、改用汉姓等措施。这些改变增加了鲜卑族与汉族在制度、语言和生活习俗上的相互接触。',
      pitfall: '民族交融不等于所有人习俗完全相同。北魏官员改变生活习惯，和东晋南朝开发江南是不同的考点。',
      question: '北魏朝廷把鲜卑皇族的拓跋姓改为元姓，这与哪位皇帝的改革有关？',
      answer: '北魏孝文帝。',
      evidence: '2025福建历史第4题',
      refs: ['pep7upText', 'standard', 'fujian2025']
    },
    {
      id: 'lishi-imperial-exams', stage: '7-down', topic: '中国古代史', type: 'core',
      title: '科举从隋朝起步，也会影响社会风气',
      rule: '隋炀帝设进士科通常作为科举制正式确立的标志，唐朝继续完善科举，宋朝扩大取士规模。选官考试重视什么，就可能引导读书人努力学习什么。',
      pitfall: '不要把唐朝完善科举误作唐朝创立科举。题目只给选才标准变化，不能凭空推出考试科目有增减。',
      question: '把“设进士科”和“扩大科举取士规模”分别放到隋、宋两朝，怎么放？',
      answer: '隋朝设进士科，宋朝扩大科举取士规模。',
      evidence: '2026福建历史第7题',
      refs: ['standard', 'fujian2026']
    },
    {
      id: 'lishi-tang-cultural-exchange', stage: '7-down', topic: '中国古代史', type: 'trap',
      title: '玄奘、鉴真、遣唐使：先看谁从哪里出发',
      rule: '玄奘从唐朝西行，到天竺求取佛学知识；鉴真从唐朝东渡日本，传授佛教并传播中国文化；遣唐使则是日本派到唐朝学习的使团。',
      pitfall: '鉴真和玄奘都是僧人，但前往的地方不同；鉴真和遣唐使都与日本有关，但走的方向相反。',
      question: '甲从日本到唐朝学习，乙从唐朝到日本传授佛教。甲可能属于哪类使团？乙是谁？',
      answer: '甲可能是遣唐使团成员，乙是鉴真。',
      evidence: '2025福建历史第5题',
      refs: ['pep7down', 'standard', 'fujian2025']
    },
    {
      id: 'lishi-economic-shift-south', stage: '7-down', topic: '中国古代史', type: 'core',
      title: '经济重心南移：南宋完成，经过很久',
      rule: '经济重心南移是一个长期过程，到南宋完成。北人南迁带来劳动力和生产经验；南方农业、手工业和商业的发展，逐步抬高了南方在全国经济中的地位。',
      pitfall: '面食等生活习惯也会随人口迁移传播，但某地一种食物变多，不能单独证明经济重心已经南移。',
      question: '南迁人口为什么能带动江南农业生产？说出两点。',
      answer: '增加了劳动力，也带来了生产技术和经验。',
      evidence: '2024福建历史第7题',
      refs: ['pep7down', 'standard', 'fujian2024']
    },
    {
      id: 'lishi-maritime-trade-offices', stage: '7-down', topic: '中国古代史', type: 'trap',
      title: '宋元海贸：市舶司管港口商船和货物',
      rule: '宋元时期海外贸易兴盛，泉州是重要贸易港口。政府在一些港口设置市舶司，负责商船进出港登记、验货、抽税等事务，借此管理海外贸易。',
      pitfall: '登记和征税体现的是贸易监管。光凭这些措施，不能说船造得更先进，也不能说朝廷禁止海上贸易。',
      question: '商船到港后，官员先记录货物再按规定征税。这最符合哪个机构的职责？',
      answer: '市舶司。',
      evidence: '2026福建历史第8题',
      refs: ['pep7down', 'standard', 'fujian2026']
    },
    {
      id: 'lishi-yuan-regional-governance', stage: '7-down', topic: '中国古代史', type: 'trap',
      title: '元朝管辖：宣政院、澎湖巡检司各管哪里',
      rule: '元朝设宣政院，掌管西藏地区有关事务；在澎湖设巡检司，管辖澎湖和台湾。看古代行政区划题，先把朝代、机构和管辖区域一一对上。',
      pitfall: '元朝在澎湖设巡检司；清朝设台湾府并隶属福建省。两者都是行政管辖的例子，但朝代和机构不同。',
      question: '把宣政院、台湾府两张标签贴到元朝和清朝的展板上，各贴哪张？',
      answer: '元朝贴宣政院，清朝贴台湾府。',
      evidence: '2024福建历史第9题',
      refs: ['pep7down', 'standard', 'fujian2024']
    },
    {
      id: 'lishi-unequal-treaties', stage: '8-up', topic: '中国近代史', type: 'trap',
      title: '三场战争和三个不平等条约',
      rule: '鸦片战争后签《南京条约》，中国开始沦为半殖民地半封建社会；甲午中日战争后签《马关条约》，程度大大加深；八国联军侵华后签《辛丑条约》，中国完全沦为半殖民地半封建社会。',
      pitfall: '英国割占香港岛对应《南京条约》；允许日本在通商口岸开设工厂对应《马关条约》。先对战争，再对条款。',
      question: '1895年的谈判记录说清政府被迫将台湾割让给日本。对应的是哪个条约？',
      answer: '《马关条约》。',
      evidence: '2024福建历史第11题',
      refs: ['pep8', 'standard', 'fujian2024']
    },
    {
      id: 'lishi-early-modernization', stage: '8-up', topic: '中国近代史', type: 'core',
      title: '洋务、戊戌、辛亥：各自想改什么',
      rule: '洋务运动引进西方技术、兴办近代工业以求自强、求富；1898年维新派通过戊戌变法尝试救国；辛亥革命中，1911年武昌起义爆发，次年清帝退位，君主专制告终。',
      pitfall: '辛亥革命结束的是君主专制制度。它没有改变中国半殖民地半封建的社会性质，也不等于此后从无复辟企图。',
      question: '某人主张兴办机器制造局和近代轮船企业，同时维持清朝统治。他更接近哪一派？',
      answer: '洋务派。',
      refs: ['pep8', 'standard']
    },
    {
      id: 'lishi-may-fourth-first-cooperation', stage: '8-up', topic: '中国近代史', type: 'trap',
      title: '五四、中共一大、第一次国共合作',
      rule: '1919年五四运动是中国新民主主义革命的开端；1921年中共一大召开，宣告中国共产党诞生；1924年国民党一大召开，标志第一次国共合作正式建立。',
      pitfall: '上海开会、嘉兴南湖续会讲的是中共一大。第一次国共合作正式建立的标志是三年后的国民党一大。',
      question: '给1919、1921、1924三张时间卡，国民党一大应贴在哪一年？标志着什么？',
      answer: '1924年，标志第一次国共合作正式建立。',
      evidence: '2025福建历史第29题',
      refs: ['pep8', 'standard', 'fujian2025']
    },
    {
      id: 'lishi-long-march', stage: '8-up', topic: '中国近代史', type: 'core',
      title: '长征：出发、遵义会议、胜利会师',
      rule: '1934年中共中央和中央红军开始长征。1935年遵义会议成为中国共产党历史上生死攸关的转折点。队伍途中重视纪律、争取群众支持，1936年红军三大主力会师，长征胜利结束。',
      pitfall: '1935年中央红军到达陕北，和1936年红军三大主力会师是两个节点，不能都记作长征胜利结束。',
      question: '按先后排列：红军三大主力会师、遵义会议、中央红军开始长征。',
      answer: '中央红军开始长征 → 遵义会议 → 红军三大主力会师。',
      evidence: '2026福建历史第15题',
      refs: ['pep8', 'fujian2024', 'fujian2026']
    },
    {
      id: 'lishi-resistance-war-timeline', stage: '8-up', topic: '中国近代史', type: 'trap',
      title: '九一八和七七事变，分别是哪种起点',
      rule: '1931年九一八事变是中国人民抗日战争的起点，局部抗战开始；1937年七七事变后，全民族抗战开始；1945年中国人民抗日战争取得胜利。',
      pitfall: '从1937年起算会漏掉1931—1937年的局部抗战。台儿庄战役属正面战场，百团大战属敌后战场。',
      question: '为什么说抗日战争历时十四年？写出起止年份和起点事件。',
      answer: '1931—1945年，从九一八事变开始算起。',
      evidence: '2025福建历史第32题',
      refs: ['standard', 'fujian2024', 'fujian2025']
    },
    {
      id: 'lishi-new-china-consolidation', stage: '8-down', topic: '中国现代史', type: 'core',
      title: '新中国成立后的巩固：抗美援朝与土地改革',
      rule: '1949年中华人民共和国成立。1950年，中国人民志愿军赴朝作战，保家卫国；同年土地改革法颁布，到1952年底，中国大陆大部分地区的土地改革基本完成。',
      pitfall: '土地改革使农民获得土地，并非立刻把土地变为集体所有；通过农业合作化走上集体化，是后来的农业社会主义改造。',
      question: '新中国成立初期，哪一项措施主要改变农村土地归属？哪一项关系到抵御外来侵略？',
      answer: '土地改革改变农村土地归属；抗美援朝关系到保家卫国。',
      evidence: '2025福建历史第17题',
      refs: ['pep8', 'standard', 'fujian2025']
    },
    {
      id: 'lishi-first-plan-three-transformations', stage: '8-down', topic: '中国现代史', type: 'trap',
      title: '一五计划与三大改造，分别改变什么',
      rule: '1953—1957年，第一个五年计划集中力量优先发展重工业，为工业化奠定初步基础。到1956年底，农业、手工业、资本主义工商业的社会主义改造基本完成。',
      pitfall: '问工业化起步，想到一五计划；问社会主义基本制度建立，想到三大改造基本完成。时间接近，历史意义不同。',
      question: '新建大型钢铁企业、组织农民加入农业生产合作社，分别更直接对应哪项举措？',
      answer: '前者对应一五计划，后者对应三大改造中的农业社会主义改造。',
      refs: ['pep8', 'standard']
    },
    {
      id: 'lishi-reform-and-opening', stage: '8-down', topic: '中国现代史', type: 'core',
      title: '改革开放：对内改体制，对外扩联系',
      rule: '1978年中共十一届三中全会开启改革开放的历史新时期。农村推行家庭联产承包责任制；设立经济特区、探索中外合资经营等活动，体现了对外开放。',
      pitfall: '家庭联产承包责任制没有把集体土地变为私有。1992年提出建立社会主义市场经济体制的目标，也不等于当年已经建成。',
      question: '农户按合同承包集体土地、地方引进外资办厂，分别属于对内改革还是对外开放？',
      answer: '农户承包属于对内改革，引进外资属于对外开放。',
      evidence: '2025福建历史第18题',
      refs: ['standard', 'fujian2025', 'fujian2026']
    },
    {
      id: 'lishi-autonomy-special-regions', stage: '8-down', topic: '中国现代史', type: 'trap',
      title: '民族区域自治与香港、澳门特别行政区',
      rule: '民族区域自治是在国家统一领导下，在少数民族聚居的地方实行区域自治。香港、澳门回归后设立特别行政区，在“一国两制”方针下实行高度自治。',
      pitfall: '同样有“自治”一词，民族自治区、自治州与港澳特别行政区的设立依据不同，答题要先看材料说的是哪一类地区。',
      question: '展板一介绍自治州的民族事务，展板二介绍澳门回归后的制度。两块展板各对应什么制度或方针？',
      answer: '一对应民族区域自治制度，二对应“一国两制”。',
      evidence: '2024福建历史第16题',
      refs: ['pep8', 'standard', 'fujian2024']
    },
    {
      id: 'lishi-prc-diplomacy', stage: '8-down', topic: '中国现代史', type: 'core',
      title: '新中国外交：五项原则、万隆、联合国和中美关系',
      rule: '1953年周恩来首次提出和平共处五项原则；1955年他在万隆提倡“求同存异”，推动亚非合作。1971年中国恢复在联合国的合法权利，1972年尼克松访华，1979年中美正式建交。',
      pitfall: '1971年是恢复合法权利，不能说中国首次加入联合国；1972年是中美关系开始走向正常化，正式建交是1979年。',
      question: '外交年表里“中国恢复在联合国的合法权利”和“中美正式建交”，哪个在先？',
      answer: '恢复在联合国的合法权利在先（1971年），中美正式建交在后（1979年）。',
      evidence: '2024福建历史第28题',
      refs: ['pep8', 'standard', 'fujian2024']
    },
    {
      id: 'lishi-ancient-civilization-map', stage: '9-up', topic: '世界古代史', type: 'core',
      title: '古代亚非文明：先把河流和代表成就配对',
      rule: '尼罗河流域的古埃及有金字塔；两河流域的古巴比伦留下《汉谟拉比法典》；古代印度传播的文化成果包括佛教。认出文明归属后，还要看文物能支持什么结论。',
      pitfall: '金字塔能帮助理解古埃及法老调动大量人力物力的能力。别凭一种建筑就推出该文明的法律、医学水平。',
      question: '展签“《汉谟拉比法典》来自尼罗河流域”，错在哪儿？',
      answer: '它来自两河流域的古巴比伦，不是尼罗河流域的古埃及。',
      evidence: '2024福建历史第18题',
      refs: ['pep9upRevised', 'pep9up', 'fujian2024']
    },
    {
      id: 'lishi-renaissance-ocean-routes', stage: '9-up', topic: '世界近代史', type: 'trap',
      title: '文艺复兴重思想，新航路重跨洲联系',
      rule: '文艺复兴首先在意大利兴起，人文主义强调人的价值。15世纪末开始开辟的新航路加强了各大洲的联系，使物种和商品跨海流动，也为欧洲早期殖民扩张创造了条件。',
      pitfall: '发现作品表现人的价值，多从文艺复兴分析；看见原产美洲的作物传到欧洲，先从新航路开辟后的交流入手。',
      question: '两份材料分别写“画家关注个体的情感”和“美洲的玉米传到欧亚”。各能联系到哪件事？',
      answer: '前者联系文艺复兴，后者联系新航路开辟。',
      evidence: '2024福建历史第20题',
      refs: ['pep9up', 'fujian2024', 'fujian2025']
    },
    {
      id: 'lishi-atlantic-revolution-documents', stage: '9-up', topic: '世界近代史', type: 'trap',
      title: '英美法革命文献：限王权、宣布独立、谈权利',
      rule: '1689年英国《权利法案》限制王权；1776年美国《独立宣言》宣告独立，1787年美国宪法设计联邦政体；1789年法国《人权宣言》强调自由、平等和保护私有财产。',
      pitfall: '《独立宣言》回答为什么脱离英国，1787年宪法回答新国家的权力怎样安排。英国《权利法案》也不是法国《人权宣言》。',
      question: '图书馆收到两份美国历史文献：一份宣告摆脱英国殖民统治，一份规定总统、国会和最高法院。各是什么？',
      answer: '前者是《独立宣言》，后者是1787年美国宪法。',
      evidence: '2024福建历史第22题',
      refs: ['pep9up', 'standard', 'fujian2024']
    },
    {
      id: 'lishi-first-industrial-revolution', stage: '9-up', topic: '世界近代史', type: 'core',
      title: '第一次工业革命：机器工厂如何催生城市增长',
      rule: '第一次工业革命始于18世纪中期的英国，先在棉纺织业展开。改良蒸汽机的推广让工厂获得更方便的动力，机器生产与现代工厂扩展，吸引更多劳动力汇聚到城市。',
      pitfall: '瓦特改良了蒸汽机，并非发明最早的蒸汽机。电力广泛应用、内燃机发明和使用是第二次工业革命的线索。',
      question: '一个原本以手工作坊为主的小镇建立了很多机器工厂，周边农民可能为什么搬到这里？',
      answer: '工厂需要工人，新的工作机会吸引人口向工业城镇集中。',
      evidence: '2025福建历史第22题',
      refs: ['pep9up', 'standard', 'fujian2025']
    },
    {
      id: 'lishi-marxism-and-commune', stage: '9-up', topic: '世界近代史', type: 'core',
      title: '马克思主义诞生，看《共产党宣言》',
      rule: '马克思、恩格斯在研究工人处境、参与工人运动的过程中发展革命理论。1848年《共产党宣言》发表，标志马克思主义诞生。1871年巴黎公社是工人阶级建立政权的一次伟大尝试。',
      pitfall: '此前的工人通信、组织和宣传，能说明革命思想在传播；辨认马克思主义诞生的标志，要找《共产党宣言》的发表。',
      question: '一张时间轴要标出“革命理论诞生”和“巴黎工人建立政权的尝试”，分别写哪件事？',
      answer: '1848年《共产党宣言》发表；1871年巴黎公社成立。',
      evidence: '2024福建历史第24题',
      refs: ['pep9up', 'standard', 'fujian2024']
    },
    {
      id: 'lishi-russia-us-japan', stage: '9-down', topic: '世界近代史', type: 'trap',
      title: '俄、美、日：资本主义制度扩展的三条路',
      rule: '1861年俄国改革废除农奴制；1861—1865年美国内战维护国家统一、促进废除奴隶制；1868年开始的日本明治维新，通过发展近代产业等举措推动日本走上资本主义道路。',
      pitfall: '俄国是沙皇发动改革，美国用内战解决分裂和奴隶制问题。日本的大化改新学习中国唐朝，明治维新则向西方学习。',
      question: '同在19世纪60年代，哪个国家废除的是农奴制，哪个国家废除的是奴隶制？',
      answer: '俄国废除农奴制，美国废除奴隶制。',
      evidence: '2025福建历史第23题',
      refs: ['pep9down', 'standard', 'fujian2025']
    },
    {
      id: 'lishi-war-timelines', stage: '9-down', topic: '世界现代史', type: 'core',
      title: '两次世界大战和二战同盟的时间线',
      rule: '第一次世界大战是1914—1918年。1939年德国进攻波兰，第二次世界大战全面爆发；1942年《联合国家宣言》签署，世界反法西斯同盟形成；1945年二战结束。',
      pitfall: '1942年签署宣言是战时组建反法西斯同盟；1945年成立的是战后承担维护和平任务的联合国，名称相近但不是同一事件。',
      question: '按先后排列：联合国成立、德国进攻波兰、世界反法西斯同盟成立。',
      answer: '德国进攻波兰（1939年）→ 世界反法西斯同盟成立（1942年）→ 联合国成立（1945年）。',
      evidence: '2026福建历史第32题',
      refs: ['pep9down', 'standard', 'fujian2026']
    },
    {
      id: 'lishi-soviet-nep', stage: '9-down', topic: '世界现代史', type: 'trap',
      title: '苏俄新经济政策：粮食税和有限的私人经营',
      rule: '1921年苏俄实行新经济政策，以粮食税代替余粮收集制，允许农民在缴税后买卖剩余粮食，也允许一定范围的私人经营，利用市场促进经济恢复。',
      pitfall: '新经济政策保留一定市场空间；后来苏联推进农业集体化、优先发展重工业，是另一时期的建设做法。',
      question: '苏俄某农户交完规定粮食税后，把剩余粮食拿到市场去卖。这对应哪项经济政策？',
      answer: '新经济政策。',
      evidence: '2024福建历史第26题',
      refs: ['standard', 'fujian2024']
    },
    {
      id: 'lishi-roosevelt-new-deal', stage: '9-down', topic: '世界现代史', type: 'core',
      title: '罗斯福新政：政府怎样应对经济危机',
      rule: '1929年经济大危机爆发后，罗斯福政府在1933年开始推行新政，通过整顿金融、规范工业、兴办公共工程和提供社会保障等措施，加强国家对经济的干预。',
      pitfall: '新政缓解危机、改善一些人的处境，但没有改变美国资本主义制度，也没有消除经济危机发生的根源。',
      question: '政府出资修建水坝和道路、雇用失业人员，这类罗斯福新政措施叫什么？',
      answer: '以工代赈。',
      refs: ['pep9down', 'standard']
    },
    {
      id: 'lishi-cold-war-milestones', stage: '9-down', topic: '世界现代史', type: 'trap',
      title: '冷战开始、两极格局形成、冷战结束',
      rule: '1947年杜鲁门主义出台，通常作为冷战开始的标志。美国推动建立北约；1955年华约成立，两极格局形成。1991年苏联解体，标志冷战结束和两极格局瓦解。',
      pitfall: '冷战不只表现为军事对峙，经济援助、文化和学术活动也可能成为竞争手段。北约单独成立时，两极军事集团尚未都形成。',
      question: '为什么不能把1949年北约成立直接当作两极格局正式形成的标志？',
      answer: '另一军事集团华约直到1955年才成立。',
      evidence: '2026福建历史第26题',
      refs: ['pep9down', 'standard', 'fujian2026']
    }
  ]
};
