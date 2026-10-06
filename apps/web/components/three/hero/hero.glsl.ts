/**
 * The hero's GLSL — hero monolith spec § 4.2 and § 4.3.
 *
 * Ported from the Hero Shader Lab (concept A): `pal`, `envA`, `shadeA`, `bgA`,
 * the floor shading and `post` are the lab's own, with the quality `#define`
 * blocks deleted. The raymarch is gone; objects are real triangles, so these
 * programs do the *shading* the lab did at the end of each march and nothing
 * else.
 *
 * The look-parity rule (spec § 2.5): no `#define`, branch on a tier, or uniform
 * in here may change a colour. Tiers change pixel count, MSAA, dust count and
 * frame rate, in JavaScript, never in these strings. The only `#define` is
 * `MODE`, which picks which object a program draws (slab, dust, ring): three
 * programs from one source, identical shading.
 */

export const OBJECT_MODES = { slab: 0, dust: 1, ring: 2 } as const

const COMMON = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;uniform float uTime;uniform float uS;uniform vec2 uCenter;uniform float uZoom;uniform float uAspect;
uniform vec3 uRo;uniform vec3 uUu;uniform vec3 uVv;uniform vec3 uWw;uniform vec4 uP;uniform float uMirror;uniform float uHead;uniform float uMixRefl;
const vec3 BG=vec3(.004,.0056,.0086);const vec3 VIOL=vec3(.202,.042,.846);const vec3 VIOLL=vec3(.386,.258,.956);
const vec3 CYANL=vec3(.136,.807,.947);const vec3 MAG=vec3(.694,.061,.863);
vec2 r2(vec2 v,float a){float c=cos(a),s=sin(a);return vec2(v.x*c-v.y*s,v.x*s+v.y*c);}
float hash21(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec3 hash33(vec3 p3){p3=fract(p3*vec3(.1031,.103,.0973));p3+=dot(p3,p3.yxz+33.33);return fract((p3.xxy+p3.yxx)*p3.zyx);}
vec2 getP(vec2 fc){return (fc/uRes-uCenter)*vec2(uAspect,1.)*uZoom;}
vec3 pal(float h){h=fract(h)*3.;float i=floor(h);float f=smoothstep(0.,1.,fract(h));
if(i<1.)return mix(VIOLL,CYANL,f);if(i<2.)return mix(CYANL,MAG,f);return mix(MAG,VIOLL,f);}
float gR=0.;
float panel(float az,float y,float ca,float wa,float cy,float hy,float s0){float soft=s0+gR*.45;
float da=abs(atan(sin(az-ca),cos(az-ca)));
return (1.-smoothstep(wa,wa+soft,da))*(1.-smoothstep(hy,hy+soft*3.,abs(y-cy)))*(wa+s0)/(wa+soft);}
vec4 clipPos(vec3 P){vec3 r=P-uRo;float d=dot(r,uWw);float N=.1,F=60.;
return vec4(uP.x*dot(r,uUu)+uP.z*d,uP.y*dot(r,uVv)+uP.w*d,((F+N)*d-2.*F*N)/(F-N),d);}
vec3 mirrorP(vec3 p){return vec3(p.x,-3.-p.y,p.z);}`

const ENV = `vec3 envA(vec3 d){
d.xz=r2(d.xz,uTime*.035);
float y=d.y;float az=atan(d.x,d.z);
vec3 c=mix(vec3(.002,.003,.007),vec3(.012,.009,.042),smoothstep(-.3,.8,y));
c+=VIOL*.2*exp(-abs(y-.02)*8.);
c+=CYANL*3.4*panel(az,y,-.8,.075,.3,.55,.02);
c+=VIOLL*2.3*panel(az,y,.95,.14,.3,.5,.03);
c+=vec3(1.,.96,1.)*4.*panel(az,y,2.55,.028,.35,.65,.012);
c+=MAG*1.3*panel(az,y,-2.3,.1,.15,.3,.03);
c+=vec3(.75,.82,1.)*1.6*smoothstep(.8,.92,y);
return c;}
vec3 shadeA(vec3 p,vec3 n,vec3 rd,float id){
float ndv=clamp(dot(n,-rd),0.,1.);
vec3 e=envA(normalize(reflect(rd,n)*2.2+p*vec3(.55,.3,.55)));
if(id>.5)return pal(.2*p.y+uTime*.03+ndv*.25)*.85+e*.35;
float fac=hash21(floor(n.xz*3.+n.y*5.+vec2(7.)));
float th=.95*(1.-ndv)+.42*p.y+.55*fac+.35*p.x+.07*sin(p.x*3.+uTime*.15)+.35;
vec3 film=pal(th*1.1);
float fres=pow(1.-ndv,3.2);
vec3 refl=e*mix(vec3(.85,.88,1.),film*2.,clamp(.3+.6*fres,0.,1.));
vec3 L=normalize(vec3(-.5,.8,.55));float dif=max(dot(n,L),0.);
vec3 body=vec3(.006,.007,.018)+film*.05*dif+film*.012;
vec3 rim=mix(CYANL,VIOLL,.5+.5*n.x)*fres*1.5;
float ao=.45+.55*smoothstep(-1.5,.3,p.y);
return (body+refl+rim)*ao;}
vec3 bgA(vec2 p,vec3 rd){
float halo=exp(-dot(p*vec2(1.,.7),p*vec2(1.,.7))*3.2);
vec3 c=BG+vec3(.05,.022,.15)*halo*.75+vec3(0.,.03,.05)*exp(-dot(p-vec2(.3,-.2),p-vec2(.3,-.2))*6.)*.5;
c+=VIOL*.04*exp(-abs(rd.y+.02)*22.);
return c;}`

const PLANES = `uniform vec4 uPl[12];
float slabSd(vec3 p){float m=-1e9;for(int i=0;i<12;i++)m=max(m,dot(uPl[i].xyz,p)-uPl[i].w);return m;}`

/** Slab, dust and ring vertex programs, picked by `#define MODE`. */
export const VS_OBJECT = `${COMMON}
layout(location=0) in vec3 aP;layout(location=1) in vec3 aN;layout(location=2) in vec4 aI;layout(location=3) in vec2 aUV;
uniform vec3 uRing;
out vec3 vReal;out vec3 vN;out vec3 vCell;out float vIn;out float vId;
void main(){
vec3 P=aP,N=aN;vIn=0.;vId=0.;vCell=vec3(0.);
#if MODE==1
vec3 id=aI.xyz;float inside=aI.w;vec3 cp=(id+.5)*.22;vec3 h=hash33(id+7.);
float s=uS;float stag=h.x*.5;float t=smoothstep(stag,stag+.5,s/.72);
float sz=inside>.5?mix(.01+.014*h.z,.093,t):mix(.026*(.4+h.z),0.,smoothstep(0.,.8,s));
float room=max(.092-sz*1.75,0.);
vec3 off=(hash33(id+3.1)-.5)*2.*room*(inside>.5?(1.-t):1.);
off+=vec3(0.,sin(uTime*.4+h.x*20.),0.)*.01*(1.-t);
float spin=(1.-t)*(h.x-.5)*uTime*.8;
float a=h.z*6.283+spin,b=h.y*6.283+spin*.7;
vec3 v=aP*sz;v.xy=r2(v.xy,-b);v.xz=r2(v.xz,-a);
N.xy=r2(N.xy,-b);N.xz=r2(N.xz,-a);
P=cp+off+v;vIn=inside;vCell=cp;
if(sz<.0004){gl_Position=vec4(2.,2.,2.,1.);return;}
#elif MODE==2
float R=uRing.x,r=uRing.y;float u=aUV.x,w=aUV.y;
vec3 lp=vec3((R+r*cos(w))*cos(u),r*sin(w),(R+r*cos(w))*sin(u));
vec3 ln=vec3(cos(w)*cos(u),sin(w),cos(w)*sin(u));
float a=uTime*.11;float ph,th;float ri=uRing.z;
if(ri<.5){th=.38+.08*sin(a);lp.xz=r2(lp.xz,-a);lp.yz=r2(lp.yz,-th);ln.xz=r2(ln.xz,-a);ln.yz=r2(ln.yz,-th);}
else if(ri<1.5){th=-.62+.06*sin(a*1.3);ph=-a*.8+1.;lp.xz=r2(lp.xz,-ph);lp.xy=r2(lp.xy,-th);ln.xz=r2(ln.xz,-ph);ln.xy=r2(ln.xy,-th);}
else{th=1.25;ph=a*.6+2.;lp.xz=r2(lp.xz,-ph);lp.yz=r2(lp.yz,-th);ln.xz=r2(ln.xz,-ph);ln.yz=r2(ln.yz,-th);}
P=lp+vec3(0.,.05,0.);N=ln;vId=1.;
#endif
vReal=P;vN=N;
gl_Position=clipPos(uMirror>.5?mirrorP(P):P);
}`

/** One fragment program for all three objects, real or mirrored by `uMirror`. */
export const FS_OBJECT = `${COMMON}
${ENV}
${PLANES}
in vec3 vReal;in vec3 vN;in vec3 vCell;in float vIn;in float vId;out vec4 outColor;
void main(){
vec3 P=vReal,N=normalize(vN);
#if MODE==0
float blend=smoothstep(.68,.9,uS);if(hash21(gl_FragCoord.xy+3.1)>blend)discard;
#elif MODE==1
vec3 dc=abs(P-vCell);if(max(dc.x,max(dc.y,dc.z))>.11)discard;
if(vIn>.5&&slabSd(P)>0.)discard;
#endif
if(uMirror<.5){vec3 rd=normalize(P-uRo);outColor=vec4(shadeA(P,N,rd,vId)*uHead,1.);return;}
vec3 Pm=mirrorP(P);vec3 rdc=normalize(Pm-uRo);vec3 rr=vec3(rdc.x,-rdc.y,rdc.z);
float D=length(Pm-uRo);float tf=D*(uRo.y+1.5)/(uRo.y-Pm.y);float hr=D-tf;
vec3 pf=uRo+rdc*tf;
vec3 e=envA(rr)*.3;
vec3 rc=shadeA(P,N,rr,vId);rc=mix(rc,e,smoothstep(.5,4.,hr));
float fr=.07+.93*pow(1.-max(-rdc.y,0.),5.);
float fog=smoothstep(2.,12.,length(pf.xz));
float wr=fr*.9*(1.-fog);
if(uMixRefl>.5){outColor=vec4(rc*wr*uHead,wr);return;}
outColor=vec4((rc-e)*wr*uHead,1.);
}`

export const VS_FLOOR = `${COMMON}
layout(location=0) in vec3 aP;out vec3 vW;
void main(){vW=aP;gl_Position=clipPos(aP);}`

export const FS_FLOOR = `${COMMON}
${ENV}
in vec3 vW;out vec4 outColor;
float sdRectXZ(vec2 q,vec2 hs){return length(max(abs(q)-hs,0.));}
void main(){
gR=1.;vec3 pf=vW;vec3 rd=normalize(pf-uRo);vec2 p=getP(gl_FragCoord.xy);
vec3 n=vec3(0.,1.,0.);
float cd=sdRectXZ(pf.xz,vec2(.46,.3));
vec3 Ld=normalize(vec3(-.5,.8,.55));
vec2 shift=-Ld.xz/Ld.y*3.;float tt=clamp(dot(pf.xz,shift)/dot(shift,shift),0.,1.);
float dsh=sdRectXZ(pf.xz-tt*shift,vec2(.46,.3));
float sh=smoothstep(0.,.06+.35*tt,dsh);
float ao=1.-.9*exp(-cd*3.);
float pool=exp(-length(pf.xz-vec2(-.6,.5))*.32);
vec3 base=vec3(.02,.024,.052)*pool*mix(.15,1.,sh)*ao;
float tFloor=length(pf-uRo);
float w=.0035*(1.+tFloor*.25);
vec2 g=abs(fract(pf.xz*2.+.5)-.5)*.5;
float grid=(1.-smoothstep(w*.4,w,min(g.x,g.y)))*exp(-length(pf.xz)*.3);
base+=mix(VIOLL,CYANL,.35)*grid*.075*mix(.35,1.,sh);
base+=pal(.55+pf.x*.08)*exp(-cd*2.2)*.09;
vec3 rr=reflect(rd,n);vec3 rc=envA(rr)*.3;
float fr=.07+.93*pow(1.-max(dot(n,-rd),0.),5.);
vec3 fl=base+rc*fr*.9;
float fog=smoothstep(2.,12.,length(pf.xz));
outColor=vec4(mix(fl,bgA(p,rd),fog)*uHead,1.);
}`

/** A full-screen triangle from `gl_VertexID`: no buffer. */
export const VS_FULL = `#version 300 es
out vec2 vUv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`

export const FS_BG = `${COMMON}
${ENV}
in vec2 vUv;out vec4 outColor;void main(){vec2 p=getP(gl_FragCoord.xy);outColor=vec4(bgA(p,vec3(0.,-.3,1.))*uHead,1.);}`

/** The lab's `post()` without its desktop scrim: vignette, shoulder, gamma, grain. Also resolves RGBA8 headroom. */
export const FS_POST = `#version 300 es
precision highp float;
in vec2 vUv;out vec4 outColor;
uniform sampler2D uTex;uniform vec2 uRes;uniform float uTime;uniform float uAspect;uniform float uGrain;uniform float uHead;
const vec3 BG=vec3(.004,.0056,.0086);
float hash21(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
void main(){vec2 fc=gl_FragCoord.xy;vec3 col=texture(uTex,vUv).rgb/uHead;
vec2 uv=fc/uRes;vec2 q=(uv-.5)*vec2(uAspect,1.);
float v=smoothstep(1.05,.12,length(q*vec2(.8,1.15)));
col=mix(BG,col,v);
vec3 hi=max(col-.55,0.);col=min(col,vec3(.55))+hi/(1.+hi*2.2);
col=pow(max(col,0.),vec3(1./2.2));
float g=hash21(fc+fract(uTime*.37)*191.)-.5;
col+=uGrain*(g*.028*(.35+.65*(1.-v))+g*.012);
outColor=vec4(col,1.);}`
