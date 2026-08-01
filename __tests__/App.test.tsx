/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: 'NavigationContainer',
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: 'StackNavigator',
    Screen: 'StackScreen',
  }),
}));

jest.mock('../src/screens/SessionListScreen', () => ({
  SessionListScreen: 'SessionListScreen',
}));

jest.mock('../src/screens/ChatScreen', () => ({
  ChatScreen: 'ChatScreen',
}));

jest.mock('../src/screens/HostConfigScreen', () => ({
  HostConfigScreen: 'HostConfigScreen',
}));

jest.mock('../src/screens/SettingsScreen', () => ({
  SettingsScreen: 'SettingsScreen',
}));

import App from '../App';

describe('App', () => {
  it('renders the application shell without crashing', async () => {
    let component: ReactTestRenderer.ReactTestRenderer | undefined;
    await ReactTestRenderer.act(async () => {
      component = ReactTestRenderer.create(<App />);
    });
    expect(component).toBeDefined();
  });
});
