import { useNavigate } from 'react-router-dom';

const Footer = () => {
  const navigate = useNavigate();

  return (
    <footer className="max-w-[1600px] mx-auto px-6 md:px-12 py-24">
      <div className="flex flex-col md:flex-row justify-between items-start gap-20">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-primary rounded-full"></div>
            <span className="text-lg font-bold tracking-tighter uppercase">PCM System</span>
          </div>
          <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
            Refining the signal in the noise of artificial intelligence.
          </p>
        </div>
        <div className="flex gap-20 md:gap-32">
          <div className="flex flex-col gap-6">
            <span className="text-xs font-bold uppercase tracking-widest text-black">Connect</span>
            <a className="text-gray-500 hover:text-primary transition-colors" href="https://github.com/tangshuang/pcm">GitHub</a>
          </div>
        </div>
      </div>
      <div className="mt-32 flex flex-col md:flex-row justify-between items-center text-[10px] font-bold uppercase tracking-widest text-gray-300">
        <span>© 2024 TangShuang</span>
        <span className="mt-4 md:mt-0">Changsha, China</span>
      </div>
    </footer>
  );
};

export default Footer;