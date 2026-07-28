import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function GuideScreen() {
  return (
    <SafeAreaView className="flex-1 bg-[#0B1220]">
      <ScrollView className="flex-1 px-5 pt-5" showsVerticalScrollIndicator={false}>
        <Text className="text-3xl font-bold text-white border-b border-gray-700 pb-3 mb-5">
          How Coin Escape Works
        </Text>

        <Text className="text-base leading-6 text-gray-300 mb-6">
          Coin Escape is a crypto withdrawal tool that lets you securely connect your exchange accounts via API keys (Read + Withdraw permissions only), monitor your balances, and quickly move your assets to a safe wallet when you need to exit.
        </Text>

        <Text className="text-2xl font-semibold text-white mt-6 mb-4">Getting Started</Text>

        <View className="flex-row mb-4">
          <Text className="font-bold text-white mr-2.5 w-6">1.</Text>
          <Text className="flex-1 text-base leading-6 text-gray-300">
            <Text className="font-bold text-white">Install Coin Escape App</Text> – Download the exchange app you want to connect and sign in to your account.
          </Text>
        </View>

        <View className="flex-row mb-4">
          <Text className="font-bold text-white mr-2.5 w-6">2.</Text>
          <Text className="flex-1 text-base leading-6 text-gray-300">
            <Text className="font-bold text-white">Create an API Key</Text> – Generate a new API key on your exchange and enable only:
            {'\n'}  ✅ Read
            {'\n'}  ✅ Withdraw
            {'\n\n'}If your exchange requires a Trusted IP, follow the exchange‑specific guide in Coin Escape and add the provided IP address to your API settings.
          </Text>
        </View>

        <View className="flex-row mb-4">
          <Text className="font-bold text-white mr-2.5 w-6">3.</Text>
          <Text className="flex-1 text-base leading-6 text-gray-300">
            <Text className="font-bold text-white">Connect to Coin Escape</Text> – Open the Coin Escape app, sign up or log in, and connect your exchange by entering your:
            {'\n'}  • API Key
            {'\n'}  • Secret Key
            {'\n'}  • Passphrase (if required)
            {'\n\n'}Some exchanges may require you to connect to a UK VPN before creating or using your API credentials.
          </Text>
        </View>

        <View className="flex-row mb-4">
          <Text className="font-bold text-white mr-2.5 w-6">4.</Text>
          <Text className="flex-1 text-base leading-6 text-gray-300">
            <Text className="font-bold text-white">Verify Your Assets</Text> – Ensure your funds are held in your exchange's <Text className="font-bold text-white">Funding</Text> or <Text className="font-bold text-white">Trading</Text> account. Assets stored in Web3 wallets or external wallets may not appear in Coin Escape.
          </Text>
        </View>

        <View className="flex-row mb-4">
          <Text className="font-bold text-white mr-2.5 w-6">5.</Text>
          <Text className="flex-1 text-base leading-6 text-gray-300">
            <Text className="font-bold text-white">Configure Withdrawals</Text> – Enter your withdrawal address and select the correct blockchain network. Always double‑check the destination address and network before proceeding.
          </Text>
        </View>

        <View className="flex-row mb-4">
          <Text className="font-bold text-white mr-2.5 w-6">6.</Text>
          <Text className="flex-1 text-base leading-6 text-gray-300">
            <Text className="font-bold text-white">Withdraw Your Funds</Text> – Once your setup is complete, tap <Text className="font-bold text-white">Real Withdrawal</Text> to securely withdraw your supported tokens.
          </Text>
        </View>

        <Text className="text-2xl font-semibold text-white mt-6 mb-4">Security</Text>

        <View className="flex-row mb-2.5">
          <Text className="text-base text-gray-400 mr-2.5 w-4">•</Text>
          <Text className="flex-1 text-base leading-6 text-gray-300">
            Coin Escape only requires <Text className="font-bold text-white">Read</Text> and <Text className="font-bold text-white">Withdraw</Text> permissions.
          </Text>
        </View>
        <View className="flex-row mb-2.5">
          <Text className="text-base text-gray-400 mr-2.5 w-4">•</Text>
          <Text className="flex-1 text-base leading-6 text-gray-300">
            Never enable unnecessary API permissions unless specifically instructed.
          </Text>
        </View>
        <View className="flex-row mb-2.5">
          <Text className="text-base text-gray-400 mr-2.5 w-4">•</Text>
          <Text className="flex-1 text-base leading-6 text-gray-300">
            Keep your API Secret and Passphrase secure. Your exchange may only display them once.
          </Text>
        </View>
        <View className="flex-row mb-2.5">
          <Text className="text-base text-gray-400 mr-2.5 w-4">•</Text>
          <Text className="flex-1 text-base leading-6 text-gray-300">
            Always verify withdrawal addresses and blockchain networks before confirming any transaction.
          </Text>
        </View>

        <Text className="text-base italic text-gray-500 mt-6 mb-10 leading-6">
          Coin Escape is designed to make connecting your exchange accounts simple, giving you a fast and convenient way to manage and withdraw your assets from one place.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
