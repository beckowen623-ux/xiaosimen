window.XIAOSIMEN_KEY_POINTS ||= {};
window.XIAOSIMEN_KEY_POINTS.dili = {
  sources: {
    pep: { label: '人民教育出版社｜初中地理新教材介绍', url: 'https://www.pep.com.cn/xw/zt/hd/12/xjcjs/cz/202409/t20240918_1995544.html' },
    standard: { label: '教育部｜义务教育地理课程标准（2022年版）', url: 'https://www.moe.gov.cn/srcsite/A26/s8001/202204/W020220420582354066450.pdf' },
    book7up: { label: '国家智慧教育平台｜人教版地理七年级上册', url: 'https://basic.smartedu.cn/tchMaterial/detail?catalogType=tchMaterial&contentId=4d045a6b-46f3-42de-9c91-89bc443cbeff&contentType=assets_document&subCatalog=dzjc' },
    book7down: { label: '国家智慧教育平台｜人教版地理七年级下册', url: 'https://basic.smartedu.cn/tchMaterial/detail?catalogType=tchMaterial&contentId=8bc3c0a8-5f4b-4d80-8427-e5d35a8669ac&contentType=assets_document&subCatalog=dzjc' },
    book8up: { label: '国家智慧教育平台｜人教版地理八年级上册', url: 'https://basic.smartedu.cn/tchMaterial/detail?catalogType=tchMaterial&contentId=4e916d49-8495-4606-9a97-672ba6489eb8&contentType=assets_document&subCatalog=dzjc' },
    book8down: { label: '国家智慧教育平台｜人教版地理八年级下册', url: 'https://basic.smartedu.cn/tchMaterial/detail?catalogType=tchMaterial&contentId=f02521c3-69db-4125-ab18-16e2232863ea&contentType=assets_document&subCatalog=dzjc' },
    fj2024: { label: '福州市教育局｜2024年福建地理试题与参考答案', url: 'https://jyj.fuzhou.gov.cn/zwgk/cswz/fzygzz/zlxz/202406/t20240621_4847790.htm' },
    fj2025: { label: '福州市教育局｜2025年福建地理试题与参考答案', url: 'https://jyj.fuzhou.gov.cn/zwgk/cswz/fzygzz/zlxz/202506/t20250621_5036745.htm' },
    fj2026: { label: '福州市教育局｜2026年福建地理试题与参考答案', url: 'https://jyj.fuzhou.gov.cn/zwgk/cswz/fzygzz/zlxz/202606/t20260623_5337400.htm' }
  },
  items: [
    {
      id: 'dili-coordinates', stage: '7-up', topic: '地球与地球仪', type: 'trap',
      title: '先判经纬度，再判半球',
      rule: '先看经纬网的方向和标注。北纬向北增，南纬向南增；东经向东增，西经向西增。赤道分南北半球，用20°W和160°E组成的经线圈分东西半球。',
      pitfall: '东经不都在东半球，例如170°E在西半球；过0°或180°附近时，别只凭一个数字的大小判断。',
      question: '30°N、170°E分别位于南北半球和东西半球的哪一侧？',
      answer: '北半球、西半球。',
      evidence: '2026福建地理第26题（1）',
      refs: ['book7up', 'standard', 'fj2026']
    },
    {
      id: 'dili-earth-motion', stage: '7-up', topic: '地球的运动', type: 'trap',
      title: '地方时看自转，季节看公转',
      rule: '地球自西向东自转，同一时区内，偏东的地点通常先到当地正午。地轴倾斜且地球绕太阳公转，直射点和昼长随季节变化；北半球夏至日，太阳直射北回归线。',
      pitfall: '同处一个时区，可以用同一个钟表时间，到达当地正午的时刻仍可能不同。',
      question: '同一纬度、同一时区的甲城在乙城以东。同一天哪个城市先到当地正午？',
      answer: '甲城。地球自西向东自转，东边先到当地正午。',
      evidence: '2026福建地理第17、19、20题',
      refs: ['book7up', 'fj2026']
    },
    {
      id: 'dili-map-scale', stage: '7-up', topic: '地图的阅读', type: 'core',
      title: '用比例尺选图、算距离',
      rule: '比例尺是图上距离除以实地水平距离，计算前先统一单位。同样图幅下，大比例尺地图通常范围较小、细节较多；查两点关系时，要先确认地图能同时显示两个地点。',
      pitfall: '1∶5000大于1∶50000。用图上直线距离换算的是实地水平直线距离，不能当成绕行的路程。',
      question: '比例尺为1∶50000的地图上，两点相距3厘米，实地水平直线距离多少？',
      answer: '1.5千米。',
      evidence: '2025福建地理第27题（4）；2026福建地理第4题',
      refs: ['book7up', 'fj2025', 'fj2026']
    },
    {
      id: 'dili-contours', stage: '7-up', topic: '地形图的判读', type: 'trap',
      title: '山谷向高处凸，山脊向低处凸',
      rule: '同一张等高线图上，线密处通常坡陡，线疏处坡缓。山谷的等高线凸向高处，山脊的等高线凸向低处。相对高度用两地中较高的海拔减去较低的海拔。',
      pitfall: '不能凭尖弯朝纸面的上方还是下方辨山谷、山脊。先找等高线标注，确定哪边的海拔更高。',
      question: '甲地附近的等高线都凸向海拔更高的一侧，甲地在山脊还是山谷？',
      answer: '山谷。',
      evidence: '2026福建地理第30题（1）',
      refs: ['book7up', 'standard', 'fj2026']
    },
    {
      id: 'dili-plate-boundaries', stage: '7-up', topic: '海陆的变迁', type: 'core',
      title: '先找板块边界，再读箭头',
      rule: '板块交界地带的地壳运动较活跃，地震、火山较集中。箭头相向可看出碰撞挤压，可能抬升山脉；箭头背向可看出张裂，可能形成裂谷或使海洋扩张。',
      pitfall: '海岸线不等于板块边界。板块内部相对稳定，仍可能发生地震，答题时别写成「只在交界处」。',
      question: '海底一条边界两侧的板块都在远离这条边界，这属于什么运动？',
      answer: '张裂（拉伸）。',
      evidence: '2026福建地理第26题（2）—（3）',
      refs: ['book7up', 'fj2026']
    },
    {
      id: 'dili-climate-graphs', stage: '7-up', topic: '气温与降水', type: 'core',
      title: '最高减最低，分清日较差与年较差',
      rule: '气候资料图上，气温曲线和降水柱通常用不同纵轴。日较差是同一天最高温减最低温；年较差是一年中最高月平均气温减最低月平均气温。读雨季还要看降水主要集中在哪些月份。',
      pitfall: '算年较差用月平均气温的两个极值，不能把某一天的极端气温直接拿来算。',
      question: '某地最热月平均气温29℃，最冷月平均气温5℃。气温年较差是多少？',
      answer: '24℃。',
      evidence: '2024福建地理第3题；2025福建地理第1题（气温日较差）',
      refs: ['book7up', 'fj2024', 'fj2025']
    },
    {
      id: 'dili-climate-factors', stage: '7-up', topic: '世界的气候', type: 'trap',
      title: '迎风坡跟着湿润气流找',
      rule: '比较两地气候，可从纬度、海陆位置和地形入手。同纬度、其他条件相近时，海拔高处通常较冷。湿润气流沿迎风坡抬升、冷却，迎风坡通常比背风坡多雨。',
      pitfall: '迎风坡取决于当时的风向，南坡不一定是迎风坡；迎的是干燥气流时，也不一定多雨。',
      question: '一股来自海洋的湿润气流从东边接近一座山，东坡和西坡哪边通常降水更多？',
      answer: '东坡。它正对湿润气流，气流沿坡抬升后更容易形成降水。',
      evidence: '2024福建地理第15题',
      refs: ['book7up', 'fj2024']
    },
    {
      id: 'dili-world-population', stage: '7-up', topic: '居民与文化', type: 'core',
      title: '比较人口疏密要看单位面积',
      rule: '人口密度是人口数除以面积。世界人口稠密区多见于北半球中低纬气候适宜的平原，许多位于沿海；极寒地带、荒漠、湿热雨林和高山通常较稀疏。',
      pitfall: '人口总数较多的地区不一定更密。判断时把人口数与同一范围的面积配对，并统一单位。',
      question: '甲地有100万人、1000平方千米；乙地有60万人、300平方千米。哪里的人口密度更大？',
      answer: '乙地，每平方千米2000人；甲地为每平方千米1000人。',
      evidence: '2025福建地理第12—14题',
      refs: ['book7up', 'fj2025']
    },
    {
      id: 'dili-asia-relief', stage: '7-down', topic: '亚洲的自然环境', type: 'core',
      title: '亚洲中部多高地，河流向周边流',
      rule: '亚洲地势总体中部高、四周较低，不少大河发源于中部高地，流向周边海洋。判断气候还要看距海远近：中亚深居内陆，海洋湿润气流难以深入，降水通常较少。',
      pitfall: '亚洲并非每条河都流入海洋。内流河可注入内陆湖泊，也可能在荒漠中断流或消失。',
      question: '中亚有大片荒漠。从海陆位置看，这里为什么通常降水较少？',
      answer: '深居内陆，远离海洋，海洋湿润气流不易到达。',
      evidence: '2026福建地理第28题（1）',
      refs: ['book7down', 'fj2026']
    },
    {
      id: 'dili-japan-ports', stage: '7-down', topic: '日本', type: 'core',
      title: '从港口理解日本工业分布',
      rule: '日本工业密集区主要在太平洋沿岸和濑户内海沿岸。临近港口，既方便海运输入所需的原料和燃料，又便于将许多工业产品运往海外。',
      pitfall: '沿海集中是总体分布特征，并非每家工厂都要临港。具体选址还要看企业的原料、市场和交通需求。',
      question: '若钢铁厂需用海船运进大量铁矿石，内陆山地和深水港附近相比，哪处更便于进口原料？',
      answer: '深水港附近，原料从船上卸下后可减少陆上转运。',
      refs: ['book7down', 'standard']
    },
    {
      id: 'dili-southeast-rivers', stage: '7-down', topic: '东南亚', type: 'trap',
      title: '水能看流量和落差，航运还看水流',
      rule: '中南半岛许多山脉和河流大致南北延伸。流量足、落差大的河段水能潜力较大；水量足、水流较平缓、结冰少的河段更便于行船，河谷平原也便于耕作和聚居。',
      pitfall: '同一条河，上游可能适合开发水能，下游可能更适合航运；水能丰富不能直接推出航运便利。',
      question: '同一条河上下游水量都足，无结冰。若上游多急流、下游较平缓，通常哪段更便于通航？',
      answer: '下游，水流较平缓。',
      evidence: '2025福建地理第28题（2）—（3）',
      refs: ['book7down', 'fj2025']
    },
    {
      id: 'dili-west-asia-oil-water', stage: '7-down', topic: '西亚', type: 'core',
      title: '西亚既有石油资源，也有用水约束',
      rule: '西亚不少地区干旱，农业常需要利用河流或绿洲水源灌溉。石油资源多分布在波斯湾及其沿岸，油轮从波斯湾驶向阿曼湾要经过霍尔木兹海峡。',
      pitfall: '石油丰富与淡水紧缺可以同时存在；看到一个灌溉农区，也不能据此判断当地降水丰富。',
      question: '从波斯湾驶入阿曼湾的油轮，要通过哪个海峡？',
      answer: '霍尔木兹海峡。',
      refs: ['book7down', 'standard']
    },
    {
      id: 'dili-africa-savanna', stage: '7-down', topic: '撒哈拉以南非洲', type: 'trap',
      title: '辨热带草原气候，要找干季和湿季',
      rule: '撒哈拉以南非洲广布热带草原气候，全年较热，降水有明显的干、湿季。靠近撒哈拉南缘的地区通常更干燥，保护和恢复适地植被、合理放牧有助于防治土地荒漠化。',
      pitfall: '草原与沙漠的植被、雨量不同。在图上辨认气候区，先看图例与位置，不凭「全年高温」一条就下结论。',
      question: '两地都全年高温：甲地各月多雨，乙地有明显干季和湿季。哪个更符合热带草原气候？',
      answer: '乙地。它的降水季节变化明显。',
      evidence: '2026福建地理第12—13题',
      refs: ['book7down', 'fj2026']
    },
    {
      id: 'dili-brazil-rainforest', stage: '7-down', topic: '巴西', type: 'core',
      title: '亚马孙雨林的水热与生态价值',
      rule: '巴西北部的亚马孙平原广布热带雨林。雨林能涵养水源、储存碳，也给众多物种提供栖息地；大面积清林会让这些生态作用减弱。',
      pitfall: '判断某地是否适合扩大种植，不能只看雨热条件，也要看土地利用现状和生态保护限制。',
      question: '某公司只因当地雨热充足，就建议大面积清除雨林种植。请补充一个它忽略的因素。',
      answer: '例如雨林的生态价值：清林会失去许多野生生物的栖息地。',
      evidence: '2025福建地理第6题',
      refs: ['book7down', 'fj2025']
    },
    {
      id: 'dili-polar-seasons', stage: '7-down', topic: '极地地区', type: 'trap',
      title: '极地考察和通航先辨南北半球',
      rule: '北极地区以北冰洋为中心，南极地区以南极大陆为主。我国冬季大致对应南极暖季；北极东北航线在北半球暖季通常海冰较少、较有利于通航。',
      pitfall: '南极暖季依然寒冷。北极暖季也不能保证每段航线无冰，实际通航还要看海冰、船舶等条件。',
      question: '科考队计划在1月和7月中选一个月去南极野外考察，通常哪个月更适合？',
      answer: '1月，处于南极暖季。',
      evidence: '2024福建地理第30题（2）；2026福建地理第22题',
      refs: ['book7down', 'fj2024', 'fj2026']
    },
    {
      id: 'dili-china-population', stage: '8-up', topic: '中国的人口', type: 'core',
      title: '用黑河—腾冲线概括人口疏密',
      rule: '我国人口分布总体东多西少。黑河—腾冲线的东南侧人口相对稠密，西北侧相对稀疏。写分布特征时，先说总体格局，再举出图上明显的密集区和稀疏区。',
      pitfall: '分界线概括的是全国总体格局。线的西北侧也会有局部人口密集区，如部分绿洲和大城市。',
      question: '同在黑河—腾冲线西北侧，绿洲和周围荒漠哪处的人口一般更密？',
      answer: '绿洲，较易获得生产、生活所需的水。',
      refs: ['book8up', 'pep']
    },
    {
      id: 'dili-china-steps', stage: '8-up', topic: '中国的地形', type: 'core',
      title: '分清三级阶梯的代表地形',
      rule: '我国地势总体西高东低，大致分三级阶梯。第一级以青藏高原为主，第二级多高原和盆地，第三级多平原和丘陵。读剖面先看整体起伏，再找交界地带。',
      pitfall: '阶梯概括的是总体地势，同一级也有明显起伏。不能据此断定任一西部地点都比东部地点高。',
      question: '青藏高原和长江中下游平原，分别位于我国地势的第几级阶梯？',
      answer: '青藏高原在第一级，长江中下游平原在第三级。',
      evidence: '2026福建地理第9题',
      refs: ['book8up', 'fj2026']
    },
    {
      id: 'dili-china-monsoon', stage: '8-up', topic: '中国的气候', type: 'trap',
      title: '气温看纬度、海拔，降水看季风',
      rule: '我国冬季南北温差通常比夏季显著；夏季除青藏高原等地外，普遍较热。年降水量大体由东南沿海向西北内陆递减；当地降水的季节变化还要结合夏季风来判断。',
      pitfall: '纬度相近的地方，海拔不同也可有很大的气温差异；山地还能阻挡气流，别只用纬度解释。',
      question: '纬度相近的两地，甲地海拔约300米，乙地海拔约3000米。其他条件相近时，哪地通常更凉？',
      answer: '乙地。海拔较高，气温通常较低。',
      evidence: '2026福建地理第10题、第31题（2）',
      refs: ['book8up', 'fj2026']
    },
    {
      id: 'dili-yellow-river-sediment', stage: '8-up', topic: '中国的河流与湖泊', type: 'core',
      title: '黄河中游多来沙，下游泥沙易淤积',
      rule: '黄河中游流经黄土高原，暴雨冲刷疏松的黄土，把泥沙带进河里。下游进入平原后流速减慢，泥沙沉积，部分河段的河床逐渐抬高，形成地上河。',
      pitfall: '解释下游淤积，要同时交代「中游来沙多」和「下游流速慢」，只写其中一项原因不完整。',
      question: '要减少黄河中游坡地冲进河里的泥沙，可以采用哪种办法？',
      answer: '例如在不宜耕作的坡地恢复植被，减轻地表径流的冲刷。',
      evidence: '2026福建地理第29题（2）',
      refs: ['book8up', 'fj2026']
    },
    {
      id: 'dili-water-resources', stage: '8-up', topic: '中国的水资源', type: 'trap',
      title: '缺水要区分季节、地区和人均量',
      rule: '我国水资源大体南丰北少，不少地区夏秋多、冬春少。水库可蓄丰补枯，调节供水的季节变化；跨流域调水可在条件允许时缓解部分地区水资源分布不均。',
      pitfall: '水资源总量较大，人均量未必较大；南方也可能出现季节性缺水，或因水质不合格出现缺水。',
      question: '某县水源充足但降水集中在夏季，冬春供水不足。哪类工程可调节本地供水的季节差异？',
      answer: '修建并合理调度水库，丰水期蓄水、枯水期补水。',
      evidence: '2024福建地理第18—20题（水资源差异与利用）',
      refs: ['book8up', 'fj2024']
    },
    {
      id: 'dili-agriculture-fit', stage: '8-up', topic: '农业与因地制宜', type: 'core',
      title: '先读作物习性，再对照当地条件',
      rule: '先从材料找作物的生长期和对温度、水分、光照等条件的要求，逐项对应当地气候、地形和灌溉水源。若问产业发展，再补充交通、市场、技术等人文条件。',
      pitfall: '雨多并不适合所有作物：有些作物怕积水、有些果树冬季需要低温休眠。要把习性与具体时段对上。',
      question: '某丘陵村夏季多雨，一种果树怕涝。选坡脚低洼地还是有排水条件的缓坡，为什么？',
      answer: '选排水条件好的缓坡，可减少积水。',
      evidence: '2024福建地理第27题（2）；2025福建地理第30题（2）',
      refs: ['book8up', 'fj2024', 'fj2025']
    },
    {
      id: 'dili-transport-choice', stage: '8-up', topic: '交通运输', type: 'core',
      title: '选运输方式先看货量和时效',
      rule: '运货先看距离、货量、时效和通达条件。远途且不急的大宗货物，常考虑水运或铁路；短途需要灵活接送，常用公路；贵重又紧急的远途货物可考虑航空。',
      pitfall: '水运一般运量大、运费低，仍要有合适的通航水道和港口。速度快也未必符合成本要求。',
      question: '两个海港间有合适航线，要远运一大批不赶时间的煤，通常选哪种运输方式？',
      answer: '水路运输。',
      evidence: '2025福建地理第7题',
      refs: ['book8up', 'fj2025']
    },
    {
      id: 'dili-disaster-triggers', stage: '8-up', topic: '自然灾害与防灾减灾', type: 'trap',
      title: '看地区和触发条件识别灾害',
      rule: '我国东南沿海在夏秋较易受台风影响；在山地丘陵，陡坡上松散土石受强降雨影响可能滑坡，陡沟中的泥沙碎石与水混合向下冲则可能形成泥石流。',
      pitfall: '同一场暴雨也可能引发滑坡或泥石流。滑坡看坡上土石整体下滑，泥石流看沟中泥水裹挟碎石流动。',
      question: '强降雨后，陡沟里突然涌出大量混着砂石的泥水，最符合哪种地质灾害？',
      answer: '泥石流。',
      evidence: '2025福建地理第30题（1）；2026福建地理第2题',
      refs: ['book8up', 'fj2025', 'fj2026']
    },
    {
      id: 'dili-qinling-huaihe', stage: '8-down', topic: '中国的地理差异', type: 'trap',
      title: '秦岭—淮河联系气候和耕作差异',
      rule: '秦岭—淮河是我国东部南、北方地区的重要分界，大致接近1月0℃等温线和年降水量800毫米等值线。附近地区两侧常表现为南侧较暖湿、北侧较冷干。',
      pitfall: '几条界线只是大致接近。判断某县适合水田还是旱地，还要考虑当地的海拔、地形和灌溉水源。',
      question: '在秦岭—淮河附近的东部低海拔地区，某地1月平均气温−3℃、年降水量600毫米，较可能在线的哪侧？',
      answer: '北侧。低于0℃、少于800毫米，两项都更符合北侧的一般特征。',
      refs: ['book8down', 'standard']
    },
    {
      id: 'dili-northeast-grain', stage: '8-down', topic: '北方地区·东北三省', type: 'core',
      title: '东北粮食优势和热量限制一起记',
      rule: '东北三省平原广、黑土资源丰富，不少地方的耕地容易连片，利于机械化耕作和商品粮生产。当地纬度较高，热量条件相对受限，很多地方的农作物一年一熟。',
      pitfall: '粮食总产量大可能来自耕地面积广。只看总产量，不能断定单位面积产量更高。',
      question: '与南方丘陵相比，东北平原开展大规模机械化耕作更有利的地形条件是什么？',
      answer: '平原广阔，地势较平坦，耕地易连成大片。',
      evidence: '2026福建地理第6—7题',
      refs: ['book8down', 'fj2026']
    },
    {
      id: 'dili-loess-conservation', stage: '8-down', topic: '北方地区·黄土高原', type: 'core',
      title: '按坡面位置防治水土流失',
      rule: '黄土高原土质疏松、坡面起伏、夏季暴雨集中，植被破坏会加重水土流失。可在合适的缓坡修梯田，在不宜耕作的陡坡恢复植被，在沟谷设淤地坝拦泥沙。',
      pitfall: '福建丘陵也可能因坡面裸露和暴雨发生水土流失。选治理措施要看当地图文条件，不能照搬。',
      question: '一处不宜继续耕种的陡坡改种草木，怎样减轻水土流失？',
      answer: '枝叶能减轻雨滴对地面的冲击，根系能固土，地表径流的冲刷减弱。',
      evidence: '2024福建地理第28题（2）—（3）（水土保持）',
      refs: ['book8down', 'fj2024']
    },
    {
      id: 'dili-delta-cooperation', stage: '8-down', topic: '南方地区·长江三角洲', type: 'core',
      title: '区域协作要说清各地怎样分工',
      rule: '长三角的城市借助便捷交通和信息网络开展合作，可各自发挥研发、制造等优势。回答协作成效时，先说各地提供的条件，再说人员、信息、货物怎样流动，带来什么效益。',
      pitfall: '交通改善可以缩短出行时间、降低联系成本，两地的地图直线距离不会因此改变。',
      question: '甲市有研发团队，乙市有成熟的零部件工厂。便捷的客货通道能怎样促进两地协作？',
      answer: '人员和产品往来更方便，有利于甲市研发与乙市生产分工配合。',
      evidence: '2026福建地理第14—16题',
      refs: ['book8down', 'fj2026']
    },
    {
      id: 'dili-taiwan-distribution', stage: '8-down', topic: '南方地区·台湾省', type: 'trap',
      title: '台湾岛多山，西部平原利于聚居',
      rule: '台湾岛中东部多山，西部沿海多平原。西部地势相对平坦，连片耕地较易形成，也为交通、城镇和产业集中分布提供了较好的空间条件。',
      pitfall: '答分布用「集中」或「主要」。中东部也有城镇；台湾省的地理范围不只包括台湾岛。',
      question: '只比较地形，台湾岛西部平原和中部山地，哪里容易形成大面积连续耕地？',
      answer: '西部平原，地势较为平坦。',
      refs: ['book8down', 'standard']
    },
    {
      id: 'dili-northwest-oases', stage: '8-down', topic: '西北地区·塔里木盆地', type: 'core',
      title: '找绿洲先沿山麓和河流找水',
      rule: '塔里木盆地降水少，绿洲多在盆地边缘的山麓和河流附近，灌溉常靠河水，部分河水由高山冰雪融水补给。判断种植条件时，既要看光热，也要核对水源。',
      pitfall: '阳光充足不代表能无限扩大耕地。上游过度引水，可能挤占下游生态所需的水。',
      question: '在同一个干旱盆地，沙漠腹地和有河流经过的山麓，哪处更可能发展绿洲农业？',
      answer: '有河流的山麓，灌溉水源较有保障。',
      refs: ['book8down', 'standard']
    },
    {
      id: 'dili-tibetan-river-valleys', stage: '8-down', topic: '青藏地区·自然特征与农业', type: 'core',
      title: '高原高寒，河谷可以种青稞',
      rule: '青藏地区海拔高，以高寒为主要自然特征。部分河谷海拔相对低、热量条件较好，且有可用的灌溉水源，因此能够种植青稞等作物。',
      pitfall: '有河谷农业不代表高原整体温暖；青稞能适应高原环境，也不意味着它在越冷的地方长得越好。',
      question: '同一高原上，水源都有保障的低海拔河谷和高海拔山坡，哪里一般更适合种植青稞？为什么？',
      answer: '低海拔河谷，热量条件相对较好。',
      evidence: '2024福建地理第31题（3）（青稞的生长条件）',
      refs: ['book8down', 'fj2024']
    }
  ]
};
