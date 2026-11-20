import React from 'react';
import {Composition} from 'remotion';
import {Zhongkao, ZHONGKAO_FRAMES} from './Zhongkao';

export const Root: React.FC = () => (
  <Composition id="Zhongkao" component={Zhongkao} durationInFrames={ZHONGKAO_FRAMES} fps={30} width={1080} height={1920} />
);
