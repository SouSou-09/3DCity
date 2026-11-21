# 3DCity

GTAのようなリアルな3D都市を手続き生成するプロジェクト(Three.js + TypeScript)。

碁盤目やノイズ任せにせず、実際の都市と同じ順序で階層的に生成します:
地形 → 高速道路 → 地区 → 幹線・補助幹線 → 生活道路 → (街区・建物・装飾物)。
同じシードからは常に同じ街ができます。

## 使い方

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # 生成結果の検証
npm run stats   # 複数シードの道路統計
npm run build
```

URLパラメータ: `?seed=4`、`&view=3d`、`&layers=districts,nodes,field,raw`。

## 現状: M1 地形と道路網

| 段階 | 内容 | ファイル |
|---|---|---|
| 地形 | 海岸線(湾と岬)、蛇行する川、丘 | `src/gen/terrain.ts` |
| 地区 | 都心・旧市街・住宅地・郊外・丘陵・工業・ビーチ。地区ごとに街路の向き・間隔・曲がり方・袋小路の割合が違う | `src/gen/districts.ts` |
| 高速道路 | 海岸に沿う本線、港への支線、幹線との交差部にインターチェンジ | `src/gen/highways.ts` |
| 方向場 | 地区の向き・海岸線・川岸・等高線・高速道路を合成したテンソル場 | `src/gen/tensorField.ts` |
| 街路 | 方向場に沿った流線を幹線→補助幹線→生活道路の順に引く。川には橋を架ける | `src/gen/streamlines.ts`, `src/gen/roads.ts` |
| グラフ | 交差点で分割、鋭角・極小区間の除去、行き止まりの延長と整理、公園、孤立部分の接続、橋の切り出し | `src/gen/roadGraph.ts` |

確認用の表示は2D地図(`src/debug/mapView.ts`)と簡易3Dプレビュー(`src/view3d/cityView.ts`)。

## 今後

M2 道路メッシュ(車線・歩道・交差点・立体交差) → M3 街区と敷地 → M4 建物 → M5 装飾物 → M6 見た目 → M7 操作 → M8 交通と最適化
