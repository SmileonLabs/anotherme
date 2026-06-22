import { useState } from "react";
import { APK_URL } from "@/config";
import { usePwa } from "@/hooks/use-pwa";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { 
  Download, Smartphone, LayoutGrid, BrainCircuit, Activity, 
  MessagesSquare, ShieldCheck, Trophy, Sparkles, Network,
  Heart, MessageCircle, Zap, Lightbulb, Users, Map, Target, ExternalLink
} from "lucide-react";

export default function Home() {
  const { isInstallable, isInstalled, promptInstall, isIOS } = usePwa();
  const [showManualInstall, setShowManualInstall] = useState(false);

  const handleInstallClick = () => {
    if (isInstallable) {
      promptInstall();
    } else {
      setShowManualInstall(true);
    }
  };

  const PrimaryActions = ({ className = "" }: { className?: string }) => (
    <div className={`flex flex-col sm:flex-row gap-4 justify-center ${className}`}>
      <Button 
        size="lg" 
        className="h-14 px-8 text-lg bg-primary hover:bg-primary/90 text-white shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all duration-300 hover:shadow-[0_0_40px_rgba(139,92,246,0.5)] hover:-translate-y-1" 
        onClick={() => window.open(APK_URL, "_blank", "noopener,noreferrer")}
      >
        <Smartphone className="mr-2 h-5 w-5" />
        APK 앱 다운로드
      </Button>
      
      {!isInstalled && (
        <Button 
          size="lg" 
          variant="outline" 
          className="h-14 px-8 text-lg glass hover:bg-white/10 transition-all duration-300 hover:-translate-y-1 text-white border-white/20" 
          onClick={handleInstallClick}
        >
          <LayoutGrid className="mr-2 h-5 w-5" />
          앱 설치 (PWA)
        </Button>
      )}

      <a href={`${import.meta.env.BASE_URL}anotherme.pdf`} download>
        <Button 
          size="lg" 
          variant="ghost" 
          className="h-14 px-8 text-lg text-white hover:bg-white/5 transition-all duration-300 w-full sm:w-auto"
        >
          <Download className="mr-2 h-5 w-5" />
          소개 자료 PDF
        </Button>
      </a>
    </div>
  );

  return (
    <div className="min-h-screen bg-transparent text-foreground overflow-x-hidden selection:bg-primary/30 selection:text-white">
      
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 glass-panel border-b-0 py-4 px-6 md:px-12 flex justify-between items-center transition-all duration-300">
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}logo_black.svg`} alt="Another Me" className="h-7 md:h-9 opacity-90" />
        </div>
        <div className="flex gap-3">
          <a href="/app/" className="hidden md:block">
            <Button variant="outline" className="gap-2 glass border-white/10 hover:bg-white/10 text-white">
              <ExternalLink size={16} />
              앱 바로가기
            </Button>
          </a>
          <a href={`${import.meta.env.BASE_URL}anotherme.pdf`} download className="hidden md:block">
            <Button variant="outline" className="gap-2 glass border-white/10 hover:bg-white/10 text-white">
              <Download size={16} />
              소개서
            </Button>
          </a>
          <Button onClick={() => window.open(APK_URL, "_blank", "noopener,noreferrer")} className="gap-2 bg-white text-black hover:bg-gray-200">
            <Smartphone size={16} />
            <span className="hidden sm:inline">앱 다운로드</span>
            <span className="sm:hidden">앱 설치</span>
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-24 px-6 min-h-[95vh] flex flex-col justify-center overflow-hidden">
        {/* Main visual background */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <img
            src={`${import.meta.env.BASE_URL}images/visual.png`}
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover object-center"
          />
          {/* Readability overlay: darken left for text, keep right artwork visible */}
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40" />
          {/* Vertical blend into the page + next section */}
          <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-transparent to-background" />
        </div>

        {/* Abstract Background Orbs for Hero */}
        <div className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-primary/15 rounded-full blur-[150px] pointer-events-none mix-blend-screen z-0" />

        <div className="container mx-auto max-w-7xl relative z-10">
          <div className="space-y-8 animate-fade-in-up max-w-2xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border-primary/30 text-sm font-medium text-white/90">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              디지털 자아 육성 소셜 RPG
            </div>
            
            <h1 className="text-5xl md:text-7xl lg:text-[5rem] font-bold tracking-tight text-white leading-[1.1]">
              대화는 기록이 되고,<br />
              <span className="text-gradient text-glow-purple">기록은 자아가 된다</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-gray-400 max-w-xl font-light leading-relaxed">
              나를 닮은 또 다른 나를 성장시킨다. 당신의 일상적인 대화가 데이터가 되고, 그 데이터가 새로운 디지털 페르소나를 형성합니다.
            </p>
            
            <PrimaryActions className="pt-4 justify-start" />
          </div>
        </div>
      </section>

      {/* Stats Banner */}
      <section className="relative z-20 -mt-12 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="glass rounded-3xl p-8 md:p-12 grid grid-cols-2 md:grid-cols-5 gap-8 text-center divide-x divide-white/10">
            <div className="flex flex-col items-center justify-center border-none">
              <div className="text-4xl font-bold text-white mb-2">87<span className="text-primary text-2xl">가지</span></div>
              <div className="text-sm text-gray-400 font-medium">성장 능력치</div>
            </div>
            <div className="flex flex-col items-center justify-center">
              <div className="text-4xl font-bold text-white mb-2">100<span className="text-primary text-2xl">만+</span></div>
              <div className="text-sm text-gray-400 font-medium">누적 데이터</div>
            </div>
            <div className="flex flex-col items-center justify-center">
              <div className="text-4xl font-bold text-white mb-2">95<span className="text-primary text-2xl">%</span></div>
              <div className="text-sm text-gray-400 font-medium">자아 매칭 정확도</div>
            </div>
            <div className="flex flex-col items-center justify-center">
              <div className="text-4xl font-bold text-white mb-2">10<span className="text-primary text-2xl">k+</span></div>
              <div className="text-sm text-gray-400 font-medium">활성 사용자</div>
            </div>
            <div className="flex flex-col items-center justify-center">
              <div className="text-4xl font-bold text-white mb-2">4.9<span className="text-primary text-2xl">/5</span></div>
              <div className="text-sm text-gray-400 font-medium">유저 평점</div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section className="py-32 px-6 relative">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-3xl md:text-5xl font-bold text-white">
              데이터로 깨어나는 <span className="text-gradient">새로운 세계</span>
            </h2>
            <p className="text-lg text-gray-400">당신의 모든 대화와 선택이 의미 있는 성장이 됩니다.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="glass-card p-8 group">
              <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mb-6 group-hover:bg-primary/40 transition-colors">
                <MessagesSquare className="text-primary w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">자연스러운 대화</h3>
              <p className="text-gray-400 leading-relaxed">
                나를 닮은 AI 페르소나와의 깊이 있는 대화. 메신저 데이터가 분석되어 당신만의 고유한 톤앤매너를 학습합니다.
              </p>
            </div>

            <div className="glass-card p-8 group translate-y-0 md:translate-y-8">
              <div className="w-14 h-14 rounded-2xl bg-secondary/20 flex items-center justify-center mb-6 group-hover:bg-secondary/40 transition-colors">
                <Trophy className="text-secondary w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">토론 & 토크배틀</h3>
              <p className="text-gray-400 leading-relaxed">
                유저 간의 치열한 말발 배틀! 객관적인 AI 심판이 논리력과 설득력을 실시간으로 분석하고 점수를 매깁니다.
              </p>
            </div>

            <div className="glass-card p-8 group">
              <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center mb-6 group-hover:bg-accent/40 transition-colors">
                <Map className="text-accent w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">라이프 퀘스트</h3>
              <p className="text-gray-400 leading-relaxed">
                인생 시뮬레이션 텍스트 RPG. 다양한 선택의 기로에서 당신의 결단이 페르소나의 운명과 능력치를 결정합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Persona Growth System */}
      <section className="py-32 px-6 relative border-t border-white/5 bg-white/[0.01]">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[150px] pointer-events-none" />
        
        <div className="container mx-auto max-w-7xl grid lg:grid-cols-2 gap-20 items-center">
          <div className="space-y-8">
            <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight">
              8가지 지표로 증명되는<br />
              <span className="text-gradient">나만의 데이터 리포트</span>
            </h2>
            <p className="text-lg text-gray-400 leading-relaxed">
              당신의 페르소나는 단순한 아바타가 아닙니다. 대화, 배틀, 퀘스트를 통해 수집된 데이터는 8가지 핵심 능력치로 세밀하게 시각화됩니다. 나보다 나를 더 잘 아는 AI 리포트를 경험하세요.
            </p>
            
            <ul className="space-y-4 pt-4">
              {[
                { icon: <Target className="text-primary w-5 h-5"/>, text: "메신저 데이터를 통한 무의식적 자아 분석" },
                { icon: <Sparkles className="text-secondary w-5 h-5"/>, text: "행동 패턴 기반의 입체적인 성장 트리" },
                { icon: <Network className="text-accent w-5 h-5"/>, text: "실시간으로 변화하는 다이나믹 리포트 제공" }
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-4 text-gray-300 glass border-white/5 p-4 rounded-2xl">
                  {item.icon}
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <img 
              src={`${import.meta.env.BASE_URL}images/persona-brain.png`} 
              alt="Persona Growth Network" 
              className="absolute inset-0 w-full h-full object-cover rounded-full mix-blend-screen opacity-20 blur-sm"
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 relative z-10">
              {[
                { label: "논리성", icon: BrainCircuit, color: "text-blue-400" },
                { label: "공감력", icon: Heart, color: "text-pink-400" },
                { label: "설득력", icon: MessageCircle, color: "text-purple-400" },
                { label: "결단력", icon: Zap, color: "text-yellow-400" },
                { label: "감정조절", icon: Activity, color: "text-emerald-400" },
                { label: "창의성", icon: Lightbulb, color: "text-orange-400" },
                { label: "책임감", icon: ShieldCheck, color: "text-red-400" },
                { label: "관계력", icon: Users, color: "text-cyan-400" },
              ].map((stat, i) => (
                <div key={i} className="glass-card p-6 flex flex-col items-center justify-center gap-4 text-center hover:-translate-y-2 transition-transform">
                  <stat.icon className={`w-8 h-8 ${stat.color}`} />
                  <span className="text-white font-medium">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Community / Clan */}
      <section className="py-32 px-6 relative overflow-hidden">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-secondary/10 rounded-full blur-[150px] pointer-events-none mix-blend-screen" />
        
        <div className="container mx-auto max-w-5xl">
          <div className="glass-panel p-12 md:p-20 rounded-[3rem] text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop')] opacity-10 mix-blend-overlay bg-cover bg-center" />
            <div className="relative z-10 space-y-8">
              <Users className="w-16 h-16 text-white mx-auto mb-6 opacity-80" />
              <h2 className="text-4xl md:text-5xl font-bold text-white">
                혼자가 아닌, <span className="text-glow-blue">함께 성장하는 자아</span>
              </h2>
              <p className="text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed">
                비슷한 가치관을 가진 페르소나들이 모여 '가문'을 형성합니다. 가문 간의 지식 배틀, 협동 퀘스트를 통해 집단의 지성을 키워나가세요.
              </p>
              <div className="pt-8">
                <Button variant="outline" className="glass h-12 px-8 rounded-full border-white/20 text-white hover:bg-white/10">
                  커뮤니티 미리보기
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-40 px-6 relative border-t border-white/10 bg-gradient-to-b from-transparent to-primary/10">
        <div className="container mx-auto max-w-4xl text-center space-y-12">
          <h2 className="text-5xl md:text-6xl font-bold text-white">
            당신의 두 번째 자아,<br />
            지금 바로 만나보세요.
          </h2>
          <p className="text-xl text-gray-400">Another Me 알파 테스트에 합류하고 진정한 나를 발견하세요.</p>
          
          <PrimaryActions className="pt-8" />
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-white/10 text-center text-gray-500 glass-panel">
        <div className="container mx-auto max-w-7xl px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4 opacity-50 hover:opacity-100 transition-opacity">
            <img src={`${import.meta.env.BASE_URL}logo_black.svg`} alt="Another Me" className="h-6" />
          </div>
          <p className="text-sm">© 2024 Another Me. All rights reserved. AI-driven Social RPG.</p>
          <div className="flex gap-4 text-sm">
            <a href="#" className="hover:text-white transition-colors">이용약관</a>
            <a href="#" className="hover:text-white transition-colors">개인정보처리방침</a>
          </div>
        </div>
      </footer>

      {/* Manual Install Modal */}
      <Dialog open={showManualInstall} onOpenChange={setShowManualInstall}>
        <DialogContent className="sm:max-w-md glass-panel text-white border-white/20 bg-background/95 backdrop-blur-3xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold mb-2">앱 설치 방법</DialogTitle>
            <DialogDescription className="text-gray-400 text-base">
              홈 화면에 앱을 추가하여 언제든 편하게 접속하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 px-4 bg-white/5 rounded-xl border border-white/5 mt-4">
            {isIOS ? (
              <div className="space-y-4 text-gray-300 leading-relaxed">
                <p className="flex items-start gap-3">
                  <span className="bg-primary/20 text-primary w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-sm font-bold">1</span>
                  <span>하단 메뉴 바에서 <strong>공유(Share)</strong> 아이콘을 탭합니다.</span>
                </p>
                <p className="flex items-start gap-3">
                  <span className="bg-primary/20 text-primary w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-sm font-bold">2</span>
                  <span>목록에서 <strong>'홈 화면에 추가'</strong>를 선택합니다.</span>
                </p>
              </div>
            ) : (
              <div className="space-y-4 text-gray-300 leading-relaxed">
                <p className="flex items-start gap-3">
                  <span className="bg-primary/20 text-primary w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-sm font-bold">1</span>
                  <span>브라우저 우측 상단의 <strong>메뉴(⋮)</strong>를 탭합니다.</span>
                </p>
                <p className="flex items-start gap-3">
                  <span className="bg-primary/20 text-primary w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-sm font-bold">2</span>
                  <span><strong>'앱 설치'</strong> 또는 <strong>'홈 화면에 추가'</strong>를 선택합니다.</span>
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="mt-6">
            <Button onClick={() => setShowManualInstall(false)} className="w-full h-12 bg-primary hover:bg-primary/80 text-white font-medium text-lg">
              확인했습니다
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
