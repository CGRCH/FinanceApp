import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useScrollBottomPadding } from '@/src/hooks/useScreenInsets';

/** Offset para KeyboardAvoidingView en iOS (cabecera de stack ~44 pt + área segura superior). */
function useIosKeyboardOffset(): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'ios' ? insets.top + 44 : 0;
}

type Props = ScrollViewProps & {
  /** Padding extra bajo el contenido (además del inset seguro). */
  extraBottomPadding?: number;
  /** Evitar KeyboardAvoidingView externo (p. ej. modal). */
  keyboardAvoiding?: boolean;
};

/**
 * Scroll con inset inferior seguro y ajuste de teclado (Planilla, Deudas, Ajustes…).
 */
export function KeyboardAwareScrollView({
  children,
  contentContainerStyle,
  extraBottomPadding,
  keyboardAvoiding = true,
  keyboardShouldPersistTaps = 'handled',
  ...rest
}: Props) {
  const bottomPadding = useScrollBottomPadding(extraBottomPadding);
  const keyboardVerticalOffset = useIosKeyboardOffset();

  const scroll = (
    <ScrollView
      {...rest}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      contentContainerStyle={[contentContainerStyle, { paddingBottom: bottomPadding }]}>
      {children}
    </ScrollView>
  );

  if (!keyboardAvoiding) return scroll;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}>
      {scroll}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
