declare module "react-native-webview" {
  import { Component } from "react";
  import { ViewProps } from "react-native";

  export interface WebViewMessageEvent {
    nativeEvent: {
      data: string;
    };
  }

  export interface WebViewProps extends ViewProps {
    source?: { uri: string } | { html: string };
    onMessage?: (event: WebViewMessageEvent) => void;
    javaScriptEnabled?: boolean;
    domStorageEnabled?: boolean;
    sharedCookiesEnabled?: boolean;
    thirdPartyCookiesEnabled?: boolean;
    startInLoadingState?: boolean;
    renderLoading?: () => React.ReactElement;
    onError?: (event: { nativeEvent: { description: string } }) => void;
    onHttpError?: (event: { nativeEvent: { statusCode: number } }) => void;
    ref?: React.RefObject<WebView>;
  }

  export default class WebView extends Component<WebViewProps> {}
}
