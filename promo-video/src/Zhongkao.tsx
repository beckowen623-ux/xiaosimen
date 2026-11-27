import React from 'react';
import {AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import boxes from '../public/zk/boxes.json';
import {Background, Badge, Box, Caption, FONT, Phone, fade} from './kit';

const GREEN = '#145843';
const INDIGO = '#1e3a5f';
const B = boxes as unknown as Record<string, Record<string, Box>>;
export const ZHONGKAO_FRAMES = 1590;

const captions = [
  {from: 185, to: 315, step: '主线一 · 小四门', color: GREEN, title: '告别死记硬背\n听故事＋玩闯关', sub: '首页 5 大 Tab 直达 · 57 关趣味闯关 ＋ 6 期女声故事'},
  {from: 315, to: 440, step: '主线一 · 演播室', color: '#9a3412', title: '《考点演播室》\n男女双主持视频', sub: '讲到考点自动弹得分横幅 · 每集前 10 分钟免费试看'},
  {from: 440, to: 570, step: '主线二 · 数理化', color: GREEN, title: '395 个知识点\n按点精准补缺', sub: '3 分钟测弱项出《体检单》 · 129 套名师 4 步微课'},
  {from: 570, to: 700, step: '主线二 · 压轴模型', color: GREEN, title: '59 大名师压轴模型\n一秒搜到直接练', sub: '婆罗摩笈多 / 阿氏圆 / 安阻法 / 万能瓶 · 支持 A4 打印'},
  {from: 700, to: 820, step: '主线三 · 语文英语', color: INDIGO, title: '《语英提分工坊》\n8 大实战台 142 关', sub: '首页 5 秒试玩排雷与升格 ＋ 3 期专属女声易错字听写'},
  {from: 820, to: 940, step: '主线三 · 语文提分', color: INDIGO, title: '古诗易错字排雷\n文言精译＋阅读踩点', sub: '30 篇易错字 ＋ 16 篇文言精译 ＋ 18 个阅读 1 分 vs 满分对比'},
  {from: 940, to: 1060, step: '主线三 · 英语提分', color: INDIGO, title: '短文还原找线索\n作文 10→15 分升格', sub: '12 篇短文填空还原 ＋ 12 大作文主题三级升格与英文点读'},
  {from: 1060, to: 1205, step: '全科默写纸', color: GREEN, title: '253 条带口诀\n一键印 A4 默写纸', sub: '语英＋小四门 100% 配口诀 · 零透字背诵遮罩自测'},
  {from: 1205, to: 1350, step: '同步真题 · 云端', color: GREEN, title: '同步卷＋全国真题\n3 台设备云端同步', sub: '错题 1/3/7/14 天自动复习 · 换手机不丢闯关与错题进度'},
];

const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const a = spring({frame: f - 4, fps, config: {damping: 14}});
  const b = spring({frame: f - 30, fps, config: {damping: 14}});
  const c = spring({frame: f - 65, fps, config: {damping: 15}});
  const out = 1 - fade(f, 170, 185);
  return (
    <AbsoluteFill style={{fontFamily: FONT, alignItems: 'center', justifyContent: 'center', opacity: out, padding: 64, textAlign: 'center'}}>
      <div style={{display: 'inline-block', background: GREEN, color: '#ffe5aa', fontWeight: 900, fontSize: 38, padding: '10px 30px', borderRadius: 999, marginBottom: 38, opacity: a}}>
        👨‍👩‍👧 自家娃亲用期中冲进名列前茅
      </div>
      <div style={{fontWeight: 900, fontSize: 96, lineHeight: 1.22, color: '#1c2924', transform: `scale(${0.84 + a * 0.16})`, opacity: a}}>
        初中刷题抓不住重点？<br /><span style={{color: '#b83b2a'}}>全科三大主线一次搞定</span>
      </div>
      <div style={{fontWeight: 500, fontSize: 44, color: '#46554e', marginTop: 44, lineHeight: 1.55, opacity: b, transform: `translateY(${(1 - b) * 28}px)`}}>
        🎬 小四门演播室＋闯关 · 🎯 数理化 59 大模型<br />📖 语英 8 大提分工坊 · 📝 253 条口诀默写纸
      </div>
      <div style={{marginTop: 52, fontSize: 38, fontWeight: 900, color: GREEN, background: '#fffefa', border: '3px solid #d5e2dc', padding: '16px 38px', borderRadius: 999, opacity: c}}>
        初一到初三 · 手机刷、印 A4 卷都行
      </div>
    </AbsoluteFill>
  );
};

const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s0 = 1350;
  const lines = [
    '小四门《考点演播室》＋57 关闯关＋6 期故事',
    '数理化 395 知识点＋59 大名师压轴模型秒搜',
    '《语英提分工坊》8 大实战台 142 关＋3 期听写',
    '全科 253 条口诀 A4 默写纸 · 3 台云端同步',
    '先免费试 · 完整版 ¥19.9 一次买断用到中考',
  ];
  const logo = spring({frame: f - s0, fps, config: {damping: 13}});
  return (
    <AbsoluteFill style={{fontFamily: FONT, alignItems: 'center', paddingTop: 150, opacity: fade(f, s0, s0 + 12)}}>
      <div style={{transform: `scale(${logo})`}}><Badge size={210} /></div>
      <div style={{fontWeight: 900, fontSize: 82, color: '#1c2924', marginTop: 28}}>爱丽克丝中考题库</div>
      <div style={{fontWeight: 500, fontSize: 38, color: '#46554e', marginTop: 8}}>初一到初三 · 全科三大提分主线 · 可打印</div>
      <div style={{marginTop: 42, display: 'flex', flexDirection: 'column', gap: 22, width: 940}}>
        {lines.map((t, i) => {
          const p = spring({frame: f - s0 - 14 - i * 10, fps, config: {damping: 15}});
          const isLast = i === lines.length - 1;
          return (
            <div key={t} style={{background: isLast ? '#eef7f4' : '#fffefa', border: `3px solid ${isLast ? GREEN : '#dedfd6'}`, borderRadius: 26, padding: '22px 34px', fontSize: 40, fontWeight: 900, color: isLast ? GREEN : '#1c2924', opacity: p, transform: `translateX(${(1 - p) * 70}px)`}}>
              ✅ {t}
            </div>
          );
        })}
      </div>
      <div style={{marginTop: 52, fontWeight: 900, fontSize: 56, color: '#fff', background: GREEN, padding: '22px 62px', borderRadius: 999, opacity: fade(f, s0 + 55, s0 + 70), transform: `scale(${1 + Math.sin((f - s0) / 8) * 0.02})`}}>
        先免费试 · x4m.cc.cd
      </div>
    </AbsoluteFill>
  );
};

export const Zhongkao: React.FC = () => {
  const f = useCurrentFrame();
  const cap = captions.find(c => f >= c.from && f < c.to);
  const phoneOut = 1 - fade(f, 1340, 1355);
  return (
    <AbsoluteFill>
      <Background color={cap?.color || GREEN} />
      <Audio loop src={staticFile('bgm.wav')} volume={(fr) => interpolate(fr, [0, 15, 1545, 1590], [0, 0.16, 0.16, 0], {extrapolateRight: 'clamp'})} />
      <Sequence from={6}>
        <Audio src={staticFile('zk-vo.mp3')} volume={1} />
      </Sequence>
      {f < 188 ? <Hook /> : null}
      {cap ? <Caption key={cap.from} start={cap.from} step={cap.step} title={cap.title} sub={cap.sub} color={cap.color} /> : null}
      {f >= 180 && f < 1360 ? (
        <div style={{opacity: phoneOut}}>
          <Phone
            enterAt={180}
            shots={[
              {src: 'zk/01-home-x4m.png', from: 180},
              {src: 'zk/02-studio.png', from: 315},
              {src: 'zk/03-home-kp.png', from: 440},
              {src: 'zk/04-models.png', from: 570},
              {src: 'zk/05-home-yy.png', from: 700},
              {src: 'zk/06-yy-poem.png', from: 820},
              {src: 'zk/07-yy-writing.png', from: 940},
              {src: 'zk/08-keypoints.png', from: 1060},
              {src: 'zk/09-papers.png', from: 1205},
            ]}
            highlight={[
              ...(B['01-home-x4m']?.tabs ? [{shot: 'zk/01-home-x4m.png', box: B['01-home-x4m'].tabs, from: 205, to: 305}] : []),
              ...(B['05-home-yy']?.demo ? [{shot: 'zk/05-home-yy.png', box: B['05-home-yy'].demo, from: 725, to: 810}] : []),
              ...(B['07-yy-writing']?.upgrade ? [{shot: 'zk/07-yy-writing.png', box: B['07-yy-writing'].upgrade, from: 965, to: 1050}] : []),
              ...(B['09-papers']?.sync ? [{shot: 'zk/09-papers.png', box: B['09-papers'].sync, from: 1230, to: 1335}] : []),
            ]}
          />
        </div>
      ) : null}
      {f >= 1345 ? <Cta /> : null}
    </AbsoluteFill>
  );
};
