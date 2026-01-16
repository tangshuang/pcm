import { Link } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';

export default function HomePage() {

  return (
    <>
      <Header isHomePage={true} />

      <main className="pt-40">
        <section className="min-h-[85vh] flex flex-col justify-center px-6 md:px-12 max-w-[1600px] mx-auto">
          <div className="max-w-6xl">
            <h1 className="text-7xl md:text-[8rem] font-bold leading-[0.9] tracking-[-0.04em] mb-12 text-black">
              Intelligent Push-Based<br/>
              Context Management
            </h1>
            <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-12 mt-12">
              <p className="text-xl md:text-2xl text-gray-400 max-w-xl font-normal leading-relaxed">
                Breakthrough push-based context management for advanced AI workflows.
                Reduce token overhead by <span className="text-primary font-medium">80%</span> without losing semantic integrity.
              </p>
              <div className="flex flex-wrap gap-6">
                <Link to="/dashboard" className="bg-primary text-white px-12 py-5 text-lg font-bold rounded-none hover:bg-black transition-colors inline-block">
                  Access Demo
                </Link>
                <Link to="/paper" className="bg-gray-100 text-black px-12 py-5 text-lg font-bold rounded-none hover:bg-gray-200 transition-colors inline-block">
                  Read Whitepaper
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="py-40 px-6 md:px-12 max-w-[1600px] mx-auto" id="technology">
          <div className="feature-grid">
            <div className="col-span-12 md:col-span-6 mb-24">
              <span className="text-primary font-bold text-sm uppercase tracking-widest mb-6 block">01 / Engine</span>
              <h2 className="text-5xl font-bold mb-8 leading-tight">Dynamic Context<br/>Assembly</h2>
              <p className="text-gray-400 text-xl leading-relaxed max-w-md">
                Our proprietary algorithm analyzes user intent in real-time to assemble precisely relevant context, ensuring maximum efficiency without information loss.
              </p>
            </div>
            <div className="col-span-12 md:col-span-4 md:col-start-8 mt-32">
              <span className="material-symbols-outlined text-5xl mb-6 text-primary">psychology</span>
              <h3 className="text-2xl font-bold mb-4">Semantic Preservation</h3>
              <p className="text-gray-400 text-base leading-relaxed">
                We maintain full semantic integrity while delivering only the context that matters. Pure signal, zero noise.
              </p>
            </div>
            <div className="col-span-12 md:col-span-5 md:col-start-2 mt-32">
              <h3 className="text-2xl font-bold mb-4">Intent Recognition</h3>
              <p className="text-gray-400 text-base leading-relaxed mb-8">
                Advanced intent analysis enables precise context retrieval and compilation based on user goals.
              </p>
              <div className="w-full h-2 bg-gray-100">
                <div className="bg-primary h-full w-[95%]"></div>
              </div>
              <span className="text-xs font-bold text-gray-300 uppercase tracking-widest mt-4 block">Accuracy: 95%</span>
            </div>
            <div className="col-span-12 md:col-span-4 md:col-start-9 mt-12">
              <span className="material-symbols-outlined text-5xl mb-6 text-primary">sync_alt</span>
              <h3 className="text-2xl font-bold mb-4">Multi-Task Parallelism</h3>
              <p className="text-gray-400 text-base leading-relaxed">
                Handle multiple conversations simultaneously with intelligent context isolation and memory management.
              </p>
            </div>
          </div>
        </section>

        <section className="py-48 bg-white" id="research">
          <div className="max-w-[1600px] mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-2 gap-32">
            <div className="sticky top-40 h-fit">
              <span className="text-black font-bold text-sm uppercase tracking-widest mb-6 block">02 / Research</span>
              <h2 className="text-6xl font-bold mb-10 tracking-tight text-black">Scientific Foundation</h2>
              <p className="text-gray-400 mb-16 text-xl max-w-lg leading-relaxed">
                Based on peer-reviewed methodologies in push-based context management. Transparent, verifiable, and mathematically sound.
              </p>
              <div className="grid grid-cols-2 gap-x-12 gap-y-16">
                <div>
                  <div className="text-6xl font-medium text-black mb-2">-80%</div>
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Token Overhead</div>
                </div>
                <div>
                  <div className="text-6xl font-medium text-black mb-2">12x</div>
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Context Efficiency</div>
                </div>
                <div>
                  <div className="text-6xl font-medium text-black mb-2">0.02%</div>
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Information Loss</div>
                </div>
                <div>
                  <div className="text-6xl font-medium text-black mb-2">95%</div>
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Intent Accuracy</div>
                </div>
              </div>
              <div className="mt-16">
                <Link to="/paper" className="bg-black text-white px-12 py-5 text-lg font-bold rounded-none hover:bg-gray-800 transition-colors inline-block">
                  Read Whitepaper
                </Link>
              </div>
            </div>
            <div className="w-full pt-12 md:pt-0">
              <div className="relative group cursor-pointer">
                <div className="bg-white p-12 md:p-16 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] hover:shadow-[0_30px_80px_-15px_rgba(0,0,0,0.15)] transition-shadow duration-500">
                  <div className="flex justify-between items-start mb-16">
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-mono text-gray-400">PCM-2024</span>
                      <span className="text-xs font-mono text-gray-400">INTELLIGENT CONTEXT</span>
                    </div>
                    <span className="material-symbols-outlined text-gray-300 hover:text-primary transition-colors cursor-pointer" onClick={() => navigate('/paper')}>description</span>
                  </div>
                  <h4 className="text-3xl font-serif italic mb-10 text-black leading-tight">
                    "Push-Based Context Management:<br/>Intelligent Push-Based Context Management System"
                  </h4>
                  <div className="space-y-4 mb-16">
                    <p className="text-gray-500 font-serif leading-relaxed">
                      <span className="font-bold text-black uppercase text-xs tracking-widest mr-2 not-italic sans-serif">Abstract</span>
                      We propose a novel framework for push-based context management that leverages intent recognition. By identifying user goals in real-time, we demonstrate a method to reduce token count while maintaining semantic integrity across long-horizon tasks.
                    </p>
                    <div className="h-2 w-full bg-gray-50 mt-4"></div>
                    <div className="h-2 w-5/6 bg-gray-50"></div>
                    <div className="h-2 w-4/6 bg-gray-50"></div>
                  </div>
                  <div className="flex gap-4 items-center">
                    <div className="h-8 w-8 rounded-full bg-gray-200"></div>
                    <div className="h-8 w-8 rounded-full bg-gray-200"></div>
                    <div className="h-8 w-8 rounded-full bg-gray-200"></div>
                    <span className="text-xs text-gray-400 ml-2 font-mono">ET AL.</span>
                  </div>
                </div>
                <div className="absolute -z-10 top-4 -right-4 w-full h-full bg-gray-50"></div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-32 overflow-hidden bg-white" id="impact">
          <div className="flex gap-32 whitespace-nowrap opacity-5 select-none pointer-events-none">
            <span className="text-[15vw] font-black tracking-tighter uppercase leading-none">Efficiency</span>
            <span className="text-[15vw] font-black tracking-tighter uppercase leading-none">Intelligence</span>
          </div>
        </section>

        <section className="py-40 px-6 text-center">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-5xl md:text-7xl font-bold mb-12 tracking-tight text-black">Ready to experience?</h2>
            <div className="flex flex-col md:flex-row justify-center gap-6">
              <Link to="/dashboard" className="bg-primary text-white px-16 py-6 text-xl font-bold rounded-none hover:bg-black transition-colors inline-block min-w-[240px] text-center">
                Access Demo
              </Link>
              <Link to="/paper" className="bg-gray-100 text-black px-12 py-5 text-lg font-bold rounded-none hover:bg-gray-200 transition-colors inline-block">
                Read Whitepaper
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}