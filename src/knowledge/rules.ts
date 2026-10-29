/**
 * 知识库 · 结构与可打印性规则（L3/L4）。
 *
 * 设计原则：每条规则都要能被判定，不能是"注意一下"这种空话。
 *  - autoDetect = true：引擎/网格分析能直接判，失败了可以自动返工
 *  - autoDetect = false：只能进模型自检清单，由视觉审核或用户反馈兜底
 *
 * 数值按 0.4mm 喷嘴 / 0.2mm 层高的通用 FDM 机器给出，属于保守下界；
 * 宁可要求严一点，也不要生成"能编译但打不出来"的模型。
 */

export type RuleLayer = 'structure' | 'print';

export interface KnowledgeRule {
  /** 稳定编号，用于日志、评估集与失败归因，不要随意改。 */
  id: string;
  layer: RuleLayer;
  /** 一句话规则。 */
  title: string;
  /** 判定依据：机器可判的写判据，不可判的写"自检"。 */
  check: string;
  /** 典型反例，方便模型模式匹配。 */
  bad: string;
  /** 修复方向。 */
  fix: string;
  /** 是否可被引擎或网格分析自动判定。 */
  autoDetect: boolean;
}

export const RULES: readonly KnowledgeRule[] = [
  // ── L3 结构：由网格分析直接判定 ──────────────────────────────
  {
    id: 'S01',
    layer: 'structure',
    title: '单一连通体：整个模型必须是「一块」，除非用户明确要多件',
    check: '网格连通分量 = 1；多件（盒+盖、杯垫套装）需在 design_plan 里声明件数与原因',
    bad: '碗体与高足各自成型，中间只相切于一点，切开后是两个零件',
    fix: '让两部分的实体在高度方向重叠 ≥ 0.2mm，必要时加隐藏的连接柱',
    autoDetect: true,
  },
  {
    id: 'S02',
    layer: 'structure',
    title: '闭合曲面：不能有开放边（破面）',
    check: '网格中每条边恰好被 2 个三角形共享，开放边数 = 0',
    bad: 'difference 的被减体与被减空间共面，或壳体厚度为 0，留下开口缝',
    fix: '让布尔运算的实体错开 0.2mm 避免共面；确保每个壳都有厚度',
    autoDetect: true,
  },
  {
    id: 'S03',
    layer: 'structure',
    title: '贴床：模型最低点必须落在 z = 0',
    check: '网格 z_min ∈ [-0.01, 0.2]',
    bad: '整体做了 translate([0,0,r]) 但漏改底部，模型埋到热床下方 5mm',
    fix: '按包围盒最低点抬升，或把底部实体直接建在 z = 0 上',
    autoDetect: true,
  },
  {
    id: 'S04',
    layer: 'structure',
    title: '不悬空：最低点不能在 0.2mm 以上',
    check: '网格 z_min > 0.2 判为悬空',
    bad: '球体、旋转体以中心为原点建模，忘了抬升到热床',
    fix: '对球形/球壳按外半径抬升，或加底座与热床相连',
    autoDetect: true,
  },
  {
    id: 'S05',
    layer: 'structure',
    title: '尺寸合理：整体最小边 ≥ 0.5mm，最大边 ≤ 2000mm',
    check: '网格 bbox 三边范围',
    bad: '壁厚参数被写成 0.05，或单位误用导致 20000mm 的"花瓶"',
    fix: '检查参数单位与默认值，薄片改成实体',
    autoDetect: true,
  },
  {
    id: 'S06',
    layer: 'structure',
    title: '体积非零：不能是一堆退化面片',
    check: '网格体积 > 0.001 mm³',
    bad: '所有实体被 difference 减没了，只剩零厚度曲面',
    fix: '核对差集顺序，确保被减体没有超出被减空间',
    autoDetect: true,
  },
  {
    id: 'S07',
    layer: 'structure',
    title: '无自交：旋转体剖面不能越轴',
    check: 'rotate_extrude 剖面所有点 X ≥ 0',
    bad: '葫芦瓶收颈处控制点 X 变成负数，旋转后自交',
    fix: '收颈半径保留下界（≥ 壁厚），把过轴的点往回改',
    autoDetect: false,
  },
  {
    id: 'S08',
    layer: 'structure',
    title: '内腔不越界：差集实体必须完全包含在母体内',
    check: '自检：内腔 bbox 在母体 bbox 之内，且四周留出壁厚',
    bad: '内腔直径 = 外径，壁厚为 0；或内腔高度超出母体导致顶部开天窗',
    fix: '内腔 = 外形 - 2×壁厚；内腔高度 = 外壁高度 - 底厚 + 0.1',
    autoDetect: false,
  },

  // ── L4 可打印性：FDM 工艺约束 ───────────────────────────────
  {
    id: 'P01',
    layer: 'print',
    title: '最小壁厚 ≥ 0.8mm',
    check: '所有壳体厚度 ≥ 0.8（0.4 喷嘴两圈线宽）',
    bad: '参数 wall_thickness 默认 0.6，切片时外墙与内墙之间留缝',
    fix: '壁厚默认取 1.6~2.4，参数下界不低于 0.8',
    autoDetect: false,
  },
  {
    id: 'P02',
    layer: 'print',
    title: '最小特征高度 ≥ 0.4mm',
    check: '任何竖直方向的特征 ≥ 2 层（0.4mm）',
    bad: '凹槽深度 0.2mm，切片后完全消失',
    fix: '加深到 0.6 以上，或改为贯穿',
    autoDetect: false,
  },
  {
    id: 'P03',
    layer: 'print',
    title: '悬垂角 ≤ 45°，超过就要加支撑或改倒角',
    check: '自检：是否存在与水平面夹角 < 45° 的朝下面',
    bad: '大平面朝下悬空、内腔顶部突然放宽，全靠切片器补支撑',
    fix: '改用 45° 倒角过渡，或把朝下面改成斜坡',
    autoDetect: false,
  },
  {
    id: 'P04',
    layer: 'print',
    title: '桥接跨度 ≤ 20mm',
    check: '自检：两端有支撑、中间无支撑的跨度',
    bad: '开窗宽度 60mm 却没有任何内部支撑',
    fix: '跨度超过 20 时加中间筋，或改成拱形',
    autoDetect: false,
  },
  {
    id: 'P05',
    layer: 'print',
    title: '首层接触面积要够：细高件需加底座',
    check: '自检：底面最小水平尺寸 ≥ 8mm，或高/最小水平尺寸 ≤ 8',
    bad: '细长花瓶底部直径 10mm、高 150mm，打到一半被喷嘴带倒',
    fix: '加大底部或加外扩底座（裙边），控制在 1:8 以内',
    autoDetect: false,
  },
  {
    id: 'P06',
    layer: 'print',
    title: '配合间隙：压配 0.15 / 转动 0.25 / 滑动 0.4',
    check: '自检：所有成对装配的孔轴都留了明确间隙',
    bad: '轴直径 10、孔径 10，装配后塞不进去',
    fix: '按配合类型在孔径上加 0.15~0.4mm，并把间隙提为参数',
    autoDetect: false,
  },
  {
    id: 'P07',
    layer: 'print',
    title: '通孔直径 ≥ 2mm',
    check: '自检：所有贯穿孔最小直径',
    bad: '1mm 的穿绳孔打印后基本被堵死',
    fix: '放大到 2.5mm 以上，或改成开口槽',
    autoDetect: false,
  },
  {
    id: 'P08',
    layer: 'print',
    title: '盲孔底厚 ≥ 0.8mm',
    check: '自检：孔底到外表面的残余厚度',
    bad: '底厚 0.4 的盲孔，底部只有一层，会破',
    fix: '孔深减少，或整体加厚',
    autoDetect: false,
  },
  {
    id: 'P09',
    layer: 'print',
    title: '孔壁到外壁的余量 ≥ 1.2mm',
    check: '自检：(外壁尺寸 - 孔直径) / 2 ≥ 1.2',
    bad: '20mm 宽的块上开 18mm 的孔，两侧壁只剩 1mm',
    fix: '缩小孔径或加宽外体',
    autoDetect: false,
  },
  {
    id: 'P10',
    layer: 'print',
    title: '浮雕文字：凸起 0.6~1.2mm，笔画 ≥ 0.8mm，字高 ≥ 8mm',
    check: '自检：text() 的 size 与 extrude 高度',
    bad: 'size=5 的字、0.3mm 的凸起，打出来糊成一团',
    fix: '字高 ≥ 8、凸起 0.8 左右；镂空字改成凹刻更稳',
    autoDetect: false,
  },
  {
    id: 'P11',
    layer: 'print',
    title: '凹刻深度 ≤ 1.0mm',
    check: '自检：雕刻深度与笔画宽度',
    bad: '刻深 2mm 的细笔画，模型变成筛子',
    fix: '控制深度，或改成底切 0 的平面印记',
    autoDetect: false,
  },
  {
    id: 'P12',
    layer: 'print',
    title: '圆角半径 ≥ 1mm 才有意义',
    check: '自检：所有 fillet / offset(r) 的半径',
    bad: 'offset(r=0.3) 的圆角，视觉上看不出来还多出一堆三角面',
    fix: '圆角取 1.5~3，或干脆直角',
    autoDetect: false,
  },
  {
    id: 'P13',
    layer: 'print',
    title: '薄壁筒：半径/壁厚 ≥ 4',
    check: '自检：圆柱壳的 r 与 wall 之比',
    bad: 'r=10、壁厚 3 的灯罩，打印后截面明显不圆',
    fix: '减薄壁厚或放大半径；壁厚已到下限时优先放大半径',
    autoDetect: false,
  },
  {
    id: 'P14',
    layer: 'print',
    title: '阵列件间距 ≥ 5mm',
    check: '自检：多件同时输出时相邻间隙',
    bad: '杯垫阵列间距 1mm，打印时粘连成一坨',
    fix: '间距取 5mm 以上，或改成单件输出',
    autoDetect: false,
  },
  {
    id: 'P15',
    layer: 'print',
    title: '螺纹：牙距 ≥ 2mm，径向间隙 0.2~0.4',
    check: '自检：螺旋参数与配合间隙',
    bad: '牙距 0.8 的瓶盖，FDM 打不出来也拧不上',
    fix: '简化牙型、放大牙距，或改成卡扣结构',
    autoDetect: false,
  },
  {
    id: 'P16',
    layer: 'print',
    title: '薄板/薄壳要有加强筋',
    check: '自检：长宽比 > 5 的平板是否有筋或加厚',
    bad: '1.2mm 厚、100mm 长的底板，取下来就翘',
    fix: '底部加十字筋，或局部加厚',
    autoDetect: false,
  },
  {
    id: 'P17',
    layer: 'print',
    title: '首层不要有锐角尖点',
    check: '自检：贴床轮廓是否含 < 30° 的尖角',
    bad: '星形贴床，尖端第一层附着不住翘起',
    fix: '尖端加 1mm 圆角，或加底座裙边',
    autoDetect: false,
  },
  {
    id: 'P18',
    layer: 'print',
    title: '收尾处至少留一层厚度',
    check: '自检：顶面/斜面的最末一段不是零厚度',
    bad: '圆锥收到 r2=0 时顶端正上方不断料，形成一颗小球',
    fix: 'r2 留 0.4 以上，或用 sphere 收头',
    autoDetect: false,
  },
];

/** 把规则渲染成紧凑的自检清单，注入 system prompt。 */
export function rulesToPromptText(rules: readonly KnowledgeRule[] = RULES): string {
  const structure = rules.filter((r) => r.layer === 'structure');
  const print = rules.filter((r) => r.layer === 'print');
  const line = (r: KnowledgeRule): string =>
    `[${r.id}${r.autoDetect ? '' : '·自检'}] ${r.title}\n    判据：${r.check}\n    反例：${r.bad}\n    修复：${r.fix}`;

  return [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '七、结构与可打印性硬约束（生成后逐条核对，违反即返工）',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '【结构类】未标「·自检」的由引擎与网格分析自动判定，不通过会被打回',
    structure.map(line).join('\n'),
    '',
    '【工艺类】引擎判不了，必须写进 self_check 逐条给结论',
    print.map(line).join('\n'),
  ].join('\n');
}
