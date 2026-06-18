import React, { useEffect, useState } from 'react';
import {
  Keyboard,
  type KeyboardEvent,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const BRAND = '#006559';

/**
 * A bar pinned directly above the soft keyboard with a check button on the
 * right that dismisses it. Rendered once per window (app root, and inside each
 * Modal — Modals are a separate native window on iOS, so the root copy can't
 * reach over them).
 *
 * - iOS: positioned from live keyboard-frame events at `bottom: keyboardHeight`,
 *   using the `Will` events so the bar animates in with the keyboard.
 * - Android: the activity uses `adjustResize`, so the window already shrinks to
 *   sit above the keyboard — the bar just pins to `bottom: 0` and toggles on the
 *   `Did` show/hide events (the only ones Android emits).
 */
export default function KeyboardAccessory() {
  const [visible, setVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      const show = Keyboard.addListener('keyboardWillShow', (e: KeyboardEvent) => {
        setKeyboardHeight(e.endCoordinates.height);
        setVisible(true);
      });
      const hide = Keyboard.addListener('keyboardWillHide', () => setVisible(false));
      return () => {
        show.remove();
        hide.remove();
      };
    }
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (!visible) {
    return null;
  }

  // iOS floats above the keyboard frame; Android rides the resized window bottom.
  const bottom = Platform.OS === 'ios' ? keyboardHeight : 0;

  return (
    <View pointerEvents="box-none" style={[styles.bar, { bottom }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Done"
        hitSlop={10}
        onPress={() => Keyboard.dismiss()}
        style={styles.button}>
        <Icon name="check" size={20} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND,
  },
});
