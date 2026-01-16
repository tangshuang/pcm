import { useNavigate, Link } from 'react-router-dom';
import { Logo } from './Logo.jsx';

const Header = ({ isHomePage = false }) => {
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 left-0 w-full z-50 bg-white/90 backdrop-blur-sm transition-all duration-300">
      <div className="max-w-[1600px] mx-auto px-6 md:px-12 py-8 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Logo />
          <span className="text-xl font-bold tracking-tighter uppercase text-black">PCM</span>
        </Link>
        <nav className="hidden md:flex items-center gap-16">
          <button className="bg-primary text-white px-8 py-3 text-sm font-bold rounded-none hover:bg-black transition-colors" onClick={() => navigate('/dashboard')}>
            Access Demo
          </button>
        </nav>
      </div>
    </header>
  );
};

export default Header;