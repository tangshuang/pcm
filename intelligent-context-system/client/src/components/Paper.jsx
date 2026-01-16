import { useNavigate } from 'react-router-dom';
import MarkdownRenderer from './MarkdownRenderer';
import Header from './Header';
import Footer from './Footer';
import paperContent from '../../../../documents/Paper: Intelligent Push-Based Context Management (PCM) and Resident Multi-Stream Interactive Agent System.md?raw'

const Paper = () => {
  const navigate = useNavigate();

  return (
    <>
      <Header />

      <main className="pt-40 pb-24">
        <div className="max-w-4xl mx-auto p-8">
          <MarkdownRenderer content={paperContent} />
        </div>
      </main>

      <Footer />
    </>
  );
};

export default Paper;