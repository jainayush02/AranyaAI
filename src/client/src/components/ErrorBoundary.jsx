import React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import styles from './ErrorBoundary.module.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Aranya_UI_Crash]', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.errorBoundary}>
          <div className={styles.errorIcon}>
            <AlertTriangle size={32} />
          </div>
          <h2 className={styles.errorTitle}>Intelligence Interrupted</h2>
          <p className={styles.errorMessage}>
            Aranya encountered an unexpected glitch while processing your data. 
            Our systems have logged the event for analysis.
          </p>
          <button className={styles.retryBtn} onClick={this.handleRetry}>
            <RefreshCcw size={18} />
            Restore Session
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
