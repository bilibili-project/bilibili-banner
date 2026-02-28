import type { ParallaxLayer, StandardBannerData } from "./BannerEngine";

/**
 * Banner 数据加载器
 * 通过静态清单（MANIFEST）统一管理所有 Banner 元数据，
 * 并提供 load() 方法并行拉取所有 JSON 数据。
 *
 * 新增一期 Banner 时，只需在 MANIFEST 末尾追加一条记录即可。
 */

// 变体定义接口
export interface VariantEntry {
  name: string;
  path?: string;
  data?: unknown; // 解析后的原始JSON数据，将作为未知结构向下传递
}

// 原始清单数据结构
export interface ManifestEntry {
  date: string;
  variants: VariantEntry[];
}

// 经过网络加载解析后带有 payload 的返回结构
export interface LoadedVariant {
  name: string;
  path: string;
  data: StandardBannerData;
}

export interface LoadedBannerData {
  date: string;
  variants: LoadedVariant[];
}

export default class BannerDataLoader {
  /**
   * 所有 Banner 元数据清单，按时间升序排列。
   * - date: 上线日期（YYYY-MM-DD），用于时间轴分组显示
   * - variants: 包含该日期下所有变体的数组。
   *     - name: 变体名称，也是单变体时在时间轴上展示的默认名字
   *     - path: (可选) 数据目录名。若不填则默认使用外层 date
   */
  public static readonly MANIFEST: ManifestEntry[] = [
    {
      date: "2021-08-01",
      variants: [
        { name: "雷雨楼间 - 不眠之夜", path: "2021-08-01-thunderstorm-night" },
        { name: "凉风夏夜 - 花火照颜", path: "2021-08-01-sparkler-night" },
        { name: "晴空流光 - 极目望远", path: "2021-08-01-starlit-night" },
      ],
    },
    {
      date: "2021-08-02",
      variants: [
        { name: "盛夏晴午 - 倚窗闲话", path: "2021-08-02-summer-noon-chat" },
        { name: "阴晴之际 - 凭栏听风", path: "2021-08-02-balcony-windmill" },
      ],
    },
    { date: "2021-08-09", variants: [{ name: "林间矮屋 - 秋日盛馔" }] },
    {
      date: "2021-12-03",
      variants: [
        {
          name: "极地探险 - 企鹅之约",
          path: "2021-12-03-antarctica-expedition",
        },
        {
          name: "冰海寒夜 - 围炉取暖",
          path: "2021-12-03-antarctica-fire-night",
        },
      ],
    },
    { date: "2022-03-14", variants: [{ name: "百草惊春 - 苜蓿之眠" }] },
    { date: "2023-08-13", variants: [{ name: "碧海潜游 - 珊瑚鱼影" }] },
    { date: "2023-08-21", variants: [{ name: "沉船浮岛 - 垂钓问路" }] },
    { date: "2023-10-01", variants: [{ name: "叶舟游江 - 萤火中秋" }] },
    { date: "2023-10-26", variants: [{ name: "林间秋藏 - 猫头鹰监工" }] },
    { date: "2023-11-17", variants: [{ name: "田野牧风 - 枫叶纸鸢" }] },
    { date: "2023-12-12", variants: [{ name: "冬湖嬉冰 - 胡萝卜鼻雪人" }] },
    { date: "2024-02-01", variants: [{ name: "雪夜围炉 - 共包新岁" }] },
    { date: "2024-06-06", variants: [{ name: "春野骑行 - 橘猫电话亭" }] },
    { date: "2024-06-26", variants: [{ name: "海洋机场 - 启程远洋" }] },
    { date: "2024-09-26", variants: [{ name: "魔法少女 - 飞掠高架桥" }] },
    { date: "2024-12-26", variants: [{ name: "龙吟雪岭 - 缆车飞驰" }] },
    { date: "2025-04-05", variants: [{ name: "蒲英絮舞 - 魔女游春" }] },
    { date: "2025-06-15", variants: [{ name: "清凉一夏 - 水漫街头" }] },
    { date: "2025-09-10", variants: [{ name: "弯月流星 - 手捧星光" }] },
    { date: "2026-01-09", variants: [{ name: "雪林候车 - 学子归途" }] },
  ];

  /**
   * 按新的结构统一并行加载所有变体的数据。
   * @returns {Promise<LoadedBannerData[]>}
   */
  public async load(): Promise<LoadedBannerData[]> {
    const tasks = BannerDataLoader.MANIFEST.map(async (entry) => {
      // 遍历加载该日期下的所有变体
      const variantTasks = entry.variants.map((v) => {
        const fetchPath = v.path || entry.date;
        return fetch(`${import.meta.env.BASE_URL}assets/${fetchPath}/data.json`)
          .then((res) => res.json())
          .then(
            (rawData) =>
              ({
                name: v.name,
                path: fetchPath,
                data: this._normalizeData(rawData),
              }) as LoadedVariant,
          );
      });

      const resolvedVariants: LoadedVariant[] = await Promise.all(variantTasks);

      return {
        date: entry.date,
        variants: resolvedVariants,
      } as LoadedBannerData;
    });

    return Promise.all(tasks);
  }

  // ─────────────────────── 防腐适配器 (Anti-Corruption) ───────────────────────

  private _normalizeData(rawData: unknown): StandardBannerData {
    // 嗅探是否为纯视频格式
    if (
      rawData &&
      typeof rawData === "object" &&
      !Array.isArray(rawData) &&
      (rawData as { mode?: string }).mode === "simple-video"
    ) {
      return {
        type: "simple-video",
        payload: {
          mode: "simple-video",
          src: (rawData as { src: string }).src,
        },
      };
    }

    // 处理传统数组格式
    if (Array.isArray(rawData)) {
      const payload: ParallaxLayer[] = rawData.map((item) => {
        const isVideo = item.tagName === "video";
        return {
          ...item,
          type: isVideo ? "video" : "image",
        } as ParallaxLayer;
      });
      return {
        type: "parallax",
        payload,
      };
    }

    // 回退安全默认值
    return { type: "parallax", payload: [] };
  }
}
