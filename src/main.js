import "./styles/index.css";
import BannerDataLoader from "./core/BannerDataLoader.js";
import BannerEngine from "./core/BannerEngine.js";
import Timeline from "./ui/Timeline.js";

const loader = new BannerDataLoader();
const data = await loader.load();

const engine = new BannerEngine("#app");
// 获取最后一期（最新的一天）的第一个变体的数据
const latestItem = data[data.length - 1];
engine.updateData(latestItem.variants[0].data);
engine.start();

const ui = new Timeline(engine);
ui.init(data);
