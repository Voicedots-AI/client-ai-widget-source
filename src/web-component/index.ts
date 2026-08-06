import register from 'preact-custom-element';
import WidgetRoot from '../widget/WidgetRoot';

// This maps the <voicedots-ai> tag to our Preact component
// The 'config' string from HTML will be passed as a prop
register(WidgetRoot, 'voicedots-ai', ['config'], { shadow: true });