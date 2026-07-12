import { useState } from "react";
import { APK_URL } from "@/config";
import { type PwaPlatform, usePwa } from "@/hooks/use-pwa";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart3,
  CheckCircle2,
  Download,
  ExternalLink,
  Heart,
  LayoutGrid,
  MessageCircle,
  Mic2,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Target,
  Trophy,
  UserRound,
  Zap,
  type LucideIcon,
} from "lucide-react";

const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

const installGuides: Record<PwaPlatform, { title: string; description: string; steps: string[] }> = {
  ios: {
    title: "iPhone/iPad 설치 방법",
    description: "Safari에서 홈 화면에 추가하면 앱처럼 실행할 수 있습니다.",
    steps: [
      "Safari 하단 또는 상단의 공유 아이콘을 탭합니다.",
      "목록에서 '홈 화면에 추가'를 선택합니다.",
      "추가 후 홈 화면의 Another Me 아이콘을 누르면 앱 서비스 화면으로 바로 이동합니다.",
    ],
  },
  android: {
    title: "Android 설치 방법",
    description: "Chrome에서 앱 설치 또는 홈 화면 추가를 선택하세요.",
    steps: [
      "Chrome 우측 상단의 메뉴(⋮)를 탭합니다.",
      "'앱 설치' 또는 '홈 화면에 추가'를 선택합니다.",
      "설치 후 홈 화면의 Another Me 아이콘을 누르면 앱 서비스 화면으로 바로 이동합니다.",
    ],
  },
  desktop: {
    title: "PC 설치 방법",
    description: "Chrome 또는 Edge에서 데스크톱 앱처럼 설치할 수 있습니다.",
    steps: [
      "주소창 오른쪽의 설치 아이콘을 클릭합니다. 보이지 않으면 브라우저 메뉴를 엽니다.",
      "Chrome은 '저장 및 공유' > '페이지를 앱으로 설치', Edge는 '앱' > '이 사이트를 앱으로 설치'를 선택합니다.",
      "설치 후 바탕화면/시작 메뉴의 Another Me 아이콘을 누르면 앱 서비스 화면으로 바로 이동합니다.",
    ],
  },
};

const serviceLoop: { label: string; title: string; body: string; icon: LucideIcon }[] = [
  {
    label: "홈",
    title: "FAN / STAR 성장 카드",
    body: "오늘의 레벨, XP, 스탯과 현재 모드를 한눈에 확인합니다.",
    icon: Sparkles,
  },
  {
    label: "피드",
    title: "응원글과 공식 기록",
    body: "FAN 응원글로 관계를 만들고, 공식 STAR는 성장 기록을 공개합니다.",
    icon: Heart,
  },
  {
    label: "채팅",
    title: "관계가 쌓이는 대화",
    body: "캐릭터와 대화하며 FAN 친밀도와 자아 데이터를 함께 성장시킵니다.",
    icon: MessageCircle,
  },
  {
    label: "퀘스트",
    title: "데일리 미션 보상",
    body: "매일 초기화되는 미션을 완료하고 FAN/자아 성장 보상을 받습니다.",
    icon: Target,
  },
  {
    label: "마이",
    title: "STAR NFT 인증/장착",
    body: "STAR NFT를 등록하고 장착하면 STAR 모드와 전용 성장이 열립니다.",
    icon: Star,
  },
];

const activityCards: { title: string; body: string; icon: LucideIcon; color: string }[] = [
  {
    title: "FAN 기본 성장",
    body: "모든 유저는 FAN으로 시작합니다. 채팅, 응원, 토크배틀, 데일리 미션이 FAN 레벨과 스탯으로 쌓입니다.",
    icon: Heart,
    color: "text-pink-300",
  },
  {
    title: "STAR NFT 장착",
    body: "NFT 인증 후 캐릭터를 장착하면 연습생 STAR가 열리고, 공식 STAR 승급을 향한 전용 미션이 시작됩니다.",
    icon: ShieldCheck,
    color: "text-violet-300",
  },
  {
    title: "AI 토크배틀",
    body: "3라운드 찬반 토론을 AI 심판이 판정합니다. 결과는 보상과 피드 기록으로 이어집니다.",
    icon: Mic2,
    color: "text-blue-300",
  },
  {
    title: "누적 랭킹",
    body: "자아, FAN, STAR, 배틀 랭킹을 분리해 내가 어떤 방식으로 성장 중인지 확인합니다.",
    icon: Trophy,
    color: "text-amber-300",
  },
];

function FeaturePill({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/80">
      {children}
    </span>
  );
}

export default function Home() {
  const { isInstallable, isInstalled, promptInstall, platform } = usePwa();
  const [showManualInstall, setShowManualInstall] = useState(false);
  const installGuide = installGuides[platform] ?? installGuides.desktop;

  const handleInstallClick = async () => {
    if (isInstallable) {
      const prompted = await promptInstall();
      if (prompted) return;
    }
    setShowManualInstall(true);
  };

  const PrimaryActions = ({ className = "" }: { className?: string }) => (
    <div className={`flex flex-col gap-3 sm:flex-row ${className}`}>
      <a href={APK_URL} download>
        <Button
          size="lg"
          className="h-14 w-full px-8 text-base font-bold text-white shadow-[0_0_36px_rgba(139,92,246,0.34)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_48px_rgba(139,92,246,0.5)] sm:w-auto"
        >
          <Smartphone className="mr-2 h-5 w-5" />
          APK 다운로드
        </Button>
      </a>

      {!isInstalled ? (
        <Button
          size="lg"
          variant="outline"
          className="glass h-14 px-8 text-base font-bold text-white transition-all duration-300 hover:-translate-y-1 hover:bg-white/10"
          onClick={handleInstallClick}
        >
          <LayoutGrid className="mr-2 h-5 w-5" />
          PWA 설치하기
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-primary/30 selection:text-white">
      <nav className="glass-panel fixed left-0 top-0 z-50 flex w-full items-center justify-between px-5 py-4 md:px-12">
        <a href="#top" className="flex items-center gap-3">
          <img src={asset("logo_black.svg")} alt="Another Me" className="h-7 opacity-90 md:h-9" />
        </a>
        <div className="flex items-center gap-2 sm:gap-3">
          <a href="#flow" className="hidden text-sm font-semibold text-white/70 transition-colors hover:text-white md:block">
            서비스 흐름
          </a>
        </div>
      </nav>

      <section id="top" className="relative px-5 pb-20 pt-32 md:px-8 md:pb-28 md:pt-40">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-[-10%] top-16 h-[520px] w-[520px] rounded-full bg-primary/20 blur-[150px]" />
          <div className="absolute bottom-0 right-[-10%] h-[520px] w-[520px] rounded-full bg-blue-500/10 blur-[140px]" />
        </div>

        <div className="container relative z-10 mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="space-y-8 animate-fade-in-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-bold text-white/90">
              <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_18px_rgba(139,92,246,0.9)]" />
              FAN으로 시작하고 STAR로 성장하는 소셜 RPG
            </div>

            <div className="space-y-5">
              <h1 className="max-w-[760px] text-[clamp(2.7rem,6vw,5rem)] font-black leading-[1.02] tracking-[-0.045em] text-white [word-break:keep-all]">
                <span className="block whitespace-nowrap">FAN으로 응원하고,</span>
                <span className="text-gradient text-glow-purple block whitespace-nowrap">STAR로 증명하세요</span>
              </h1>
              <p className="max-w-[700px] text-lg leading-8 text-gray-300 [word-break:keep-all] md:text-xl">
                Another Me는 채팅, 피드, 데일리 미션, 토크배틀이 하나의 성장 기록으로 이어지는 서비스입니다. 모든 유저는 FAN으로 시작하고, STAR NFT를 장착하면 나만의 STAR 캐릭터 성장이 열립니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <FeaturePill>FAN 기본 성장</FeaturePill>
              <FeaturePill>STAR NFT 인증/장착</FeaturePill>
              <FeaturePill>공개 성장 피드</FeaturePill>
              <FeaturePill>데일리 미션</FeaturePill>
            </div>

            <PrimaryActions />
          </div>

          <div className="relative mx-auto w-full max-w-[560px]">
            <div className="glass-card relative min-h-[560px] overflow-visible rounded-[2.4rem] border-primary/30 p-5 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
              <img src={asset("images/fan_bg.png")} alt="" className="absolute inset-0 h-full w-full rounded-[2.4rem] object-cover opacity-85" />
              <div className="absolute inset-0 rounded-[2.4rem] bg-gradient-to-br from-[#08061a]/70 via-[#140b36]/35 to-[#08061a]/90" />

              <div className="relative z-10 flex items-center justify-between">
                <div className="rounded-2xl border border-white/10 bg-black/35 p-1">
                  <span className="inline-flex rounded-xl bg-primary px-5 py-2 text-xs font-black text-white">FAN</span>
                  <span className="inline-flex px-5 py-2 text-xs font-black text-white/55">STAR</span>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/75">FAN 모드</span>
              </div>

              <div className="relative z-10 mt-8 grid grid-cols-[0.82fr_1.18fr] items-end gap-1">
                <div className="relative z-20 space-y-5 pb-8">
                  <div>
                    <p className="text-sm font-bold text-white/60">FAN 성장</p>
                    <p className="text-5xl font-black text-white">Lv. 1</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full w-[36%] rounded-full bg-primary" />
                    </div>
                    <p className="mt-2 text-xs font-bold text-violet-200">360 / 1,000 XP</p>
                  </div>
                  {[
                    ["팬심", "응원력"],
                    ["공감력", "스토리"],
                  ].map((row) => (
                    <div key={row.join("-")} className="grid grid-cols-2 gap-2">
                      {row.map((label) => (
                        <div key={label} className="rounded-2xl border border-white/10 bg-black/30 p-3">
                          <p className="text-xs font-bold text-white/55">{label}</p>
                          <p className="mt-1 text-xl font-black text-white">0</p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="relative flex min-h-[390px] items-end justify-center overflow-visible">
                  <div className="absolute bottom-10 h-52 w-52 rounded-full border border-violet-300/30" />
                  <div className="absolute bottom-1 h-10 w-56 rounded-full border border-violet-300/40 bg-violet-500/15 blur-[1px]" />
                  <img src={asset("images/fan.png")} alt="FAN 캐릭터" className="pointer-events-none absolute bottom-[-330px] left-1/2 z-10 h-[1180px] w-auto -translate-x-[38%] object-contain drop-shadow-[0_45px_75px_rgba(0,0,0,0.62)] sm:bottom-[-470px] sm:h-[1520px] lg:bottom-[-680px] lg:h-[1850px]" />
                </div>
              </div>
            </div>

            <div className="glass absolute -bottom-8 -left-2 z-20 w-[78%] rounded-3xl p-4 shadow-2xl md:-left-8">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/15">
                  <Star className="h-5 w-5 text-amber-300" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">STAR NFT 미장착 상태</p>
                  <p className="text-xs text-white/55">마이에서 NFT 등록/장착 후 STAR 모드 오픈</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-20 px-5 pb-10 md:px-8">
        <div className="container mx-auto grid max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["기본 시작", "모든 유저는 FAN 보유"],
            ["STAR 오픈", "NFT 인증/장착으로 unlock"],
            ["매일 성장", "데일리 미션과 보상"],
            ["공개 기록", "피드와 랭킹으로 증명"],
          ].map(([title, body]) => (
            <div key={title} className="glass rounded-3xl p-5">
              <p className="text-2xl font-black text-white">{title}</p>
              <p className="mt-2 text-sm font-medium text-white/55">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 py-24 md:px-8" id="flow">
        <div className="container mx-auto max-w-7xl">
          <div className="mb-12 max-w-3xl space-y-4">
            <p className="text-sm font-black uppercase tracking-[0.28em] text-primary">App Flow</p>
            <h2 className="text-4xl font-black leading-tight text-white md:text-6xl">
              하단 메뉴 그대로 이해되는 성장 루프
            </h2>
            <p className="text-lg leading-8 text-gray-400">
              홈에서 현재 상태를 보고, 피드와 채팅으로 관계를 만들고, 퀘스트와 토크배틀로 보상을 쌓습니다. 마이에서는 STAR NFT 인증/장착과 전체 성장 상태를 관리합니다.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            {serviceLoop.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="glass-card p-5">
                  <div className="mb-6 flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-sm font-black text-primary">
                      {index + 1}
                    </span>
                    <Icon className="h-6 w-6 text-white/70" />
                  </div>
                  <p className="text-sm font-black text-primary">{item.label}</p>
                  <h3 className="mt-2 text-lg font-black text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-gray-400">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden px-5 py-28 md:px-8">
        <div className="container mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
          <div className="relative overflow-hidden rounded-[2.2rem] border border-white/10 p-8 md:p-10">
            <img src={asset("images/fan_bg.png")} alt="" className="absolute inset-0 h-full w-full object-cover opacity-75" />
            <div className="absolute inset-0 bg-gradient-to-br from-[#050512]/80 via-[#1d1040]/40 to-[#050512]/95" />
            <div className="relative z-10 grid gap-8 sm:grid-cols-[1fr_0.78fr] sm:items-end">
              <div className="space-y-5">
                <FeaturePill>FAN 기본 제공</FeaturePill>
                <h2 className="text-4xl font-black text-white md:text-5xl">FAN은 모든 활동의 시작점</h2>
                <p className="leading-8 text-gray-300">
                  로그인한 모든 유저는 기본 FAN 상태를 갖습니다. 응원글, 채팅, 데일리 미션, 토크배틀 결과가 FAN 레벨과 자아 성장으로 이어집니다.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {["응원력", "팬심", "공감력", "스토리"].map((stat) => (
                    <div key={stat} className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm font-bold text-white/80">
                      {stat}
                    </div>
                  ))}
                </div>
              </div>
              <img src={asset("images/fan.png")} alt="FAN 캐릭터" className="mx-auto h-[360px] w-auto object-contain drop-shadow-[0_30px_55px_rgba(0,0,0,0.55)]" />
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2.2rem] border border-white/10 p-8 md:p-10">
            <img src={asset("images/star_bg.png")} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
            <div className="absolute inset-0 bg-gradient-to-br from-[#050512]/82 via-[#27104f]/45 to-[#050512]/95" />
            <div className="relative z-10 flex h-full flex-col justify-between gap-10">
              <div className="space-y-5">
                <FeaturePill>STAR NFT 인증/장착</FeaturePill>
                <h2 className="text-4xl font-black text-white md:text-5xl">STAR는 장착 후 열리는 캐릭터 성장</h2>
                <p className="leading-8 text-gray-300">
                  STAR NFT를 등록하고 장착하면 연습생 STAR 상태가 열립니다. 미션을 통해 공식 STAR로 승급하면 공식 기록과 팬클럽 활동까지 확장됩니다.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  [ShieldCheck, "NFT 인증"],
                  [Rocket, "STAR 미션"],
                  [CheckCircle2, "공식 STAR"],
                ].map(([Icon, label]) => {
                  const StepIcon = Icon as LucideIcon;
                  return (
                    <div key={label as string} className="rounded-3xl border border-white/10 bg-black/30 p-5">
                      <StepIcon className="mb-4 h-6 w-6 text-amber-200" />
                      <p className="text-sm font-black text-white">{label as string}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-24 md:px-8">
        <div className="container mx-auto max-w-7xl">
          <div className="mb-12 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl space-y-4">
              <p className="text-sm font-black uppercase tracking-[0.28em] text-primary">Growth Proof</p>
              <h2 className="text-4xl font-black text-white md:text-6xl">성장은 기록으로 남습니다</h2>
            </div>
            <a href="/app/">
              <Button variant="outline" className="glass border-white/10 text-white hover:bg-white/10">
                앱에서 확인하기
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {activityCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.title} className="glass-card p-6">
                  <Icon className={`mb-6 h-8 w-8 ${card.color}`} />
                  <h3 className="text-xl font-black text-white">{card.title}</h3>
                  <p className="mt-4 text-sm leading-6 text-gray-400">{card.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden px-5 py-28 md:px-8">
        <div className="container mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-primary/20 via-white/[0.04] to-blue-500/10 p-8 text-center md:p-16">
          <BarChart3 className="mx-auto mb-6 h-12 w-12 text-primary" />
          <h2 className="text-4xl font-black text-white md:text-6xl">
            오늘의 FAN 성장부터
            <br />공식 STAR 기록까지
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-300">
            지금 앱을 열고 FAN 카드, 피드, 채팅, 퀘스트, 마이 화면을 순서대로 확인해보세요. 성장 흐름은 이미 준비되어 있습니다.
          </p>
          <PrimaryActions className="mt-10 justify-center" />
        </div>
      </section>

      <footer className="glass-panel border-t border-white/10 px-6 py-10 text-gray-500">
        <div className="container mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 md:flex-row">
          <img src={asset("logo_black.svg")} alt="Another Me" className="h-6 opacity-60" />
          <p className="text-sm">© 2026 Another Me. FAN grows first. STAR proves it.</p>
          <a href={asset("anotherme.pdf")} download className="inline-flex items-center gap-2 text-sm font-semibold text-white/70 hover:text-white">
            <Download className="h-4 w-4" />
            소개 자료 PDF
          </a>
        </div>
      </footer>

      <Dialog open={showManualInstall} onOpenChange={setShowManualInstall}>
        <DialogContent className="glass-panel border-white/20 bg-background/95 text-white shadow-2xl backdrop-blur-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="mb-2 text-2xl font-bold">{installGuide.title}</DialogTitle>
            <DialogDescription className="text-base text-gray-400">{installGuide.description}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 rounded-xl border border-white/5 bg-white/5 px-4 py-6">
            <div className="space-y-4 leading-relaxed text-gray-300">
              {installGuide.steps.map((step, index) => (
                <p key={step} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </p>
              ))}
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button onClick={() => setShowManualInstall(false)} className="h-12 w-full text-lg font-bold text-white">
              확인했습니다
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
