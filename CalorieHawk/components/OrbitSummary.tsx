import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

export default function OrbitSummary({
  goal = 2200, eaten = 1280, burned = 220,
  color = '#5B21B6'
}) {
  const remaining = Math.max(goal - eaten + burned, 0);
  const pct = (x:number) => Math.max(0, Math.min(1, x));
  const arc = (r:number, p:number) => {
    const sweep = pct(p) * Math.PI * 1.6, a0 = -Math.PI*0.8, a1 = a0 + sweep;
    const cx=96, cy=96, x0=cx+r*Math.cos(a0), y0=cy+r*Math.sin(a0);
    const x1=cx+r*Math.cos(a1), y1=cy+r*Math.sin(a1);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${sweep>Math.PI?1:0} 1 ${x1} ${y1}`;
  };
  const eatenPct  = eaten / goal;
  const remainPct = (goal - eaten + burned) / goal;
  const burnedPct = burned / goal;

  return (
    <View style={{ backgroundColor:'#fff', borderRadius:20, padding:12 }}>
      <View style={{ alignItems:'center', justifyContent:'center' }}>
        <Svg width={192} height={192}>
          <Circle cx={96} cy={96} r={76} stroke="#EEF2F7" strokeWidth={12} fill="none"/>
          <Circle cx={96} cy={96} r={58} stroke="#F1F5F9" strokeWidth={8}  fill="none"/>
          <Circle cx={96} cy={96} r={42} stroke="#F8FAFC" strokeWidth={6}  fill="none"/>
          <Path d={arc(76, remainPct)} stroke={color} strokeWidth={12} strokeLinecap="round" fill="none"/>
          <Path d={arc(58, eatenPct)}  stroke="#94A3B8" strokeWidth={8}  strokeLinecap="round" fill="none"/>
          <Path d={arc(42, burnedPct)} stroke="#38BDF8" strokeWidth={6}  strokeDasharray="4 6" strokeLinecap="round" fill="none"/>
        </Svg>
        <View style={{ position:'absolute', alignItems:'center' }}>
          <Text style={{ fontSize:12, color:'#64748B' }}>Remaining</Text>
          <Text style={{ fontSize:32, fontWeight:'800', color:'#0F172A' }}>{Math.round(remaining)}</Text>
          <Text style={{ fontSize:12, color:'#94A3B8' }}>Eaten {eaten} · Burned {burned}</Text>
        </View>
      </View>
    </View>
  );
}